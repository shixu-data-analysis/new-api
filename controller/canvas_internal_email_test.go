package controller

import (
	"bufio"
	"encoding/base64"
	"fmt"
	"io"
	"mime/quotedprintable"
	"net"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func postCanvasEmail(token, forwardedFor, body string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.POST("/email", middleware.CanvasInternalService(), SendCanvasInternalEmail)
	request := httptest.NewRequest(http.MethodPost, "/email", strings.NewReader(body))
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	if forwardedFor != "" {
		request.Header.Set("X-Forwarded-For", forwardedFor)
	}
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	return recorder
}

func TestCanvasInternalEmailRefusesWhatIsNotADirectCallWithTheToken(t *testing.T) {
	valid := `{"to":"admin@example.com","subject":"s","html":"<p>b</p>"}`

	t.Setenv("CANVAS_EMAIL_SERVICE_TOKEN", "")
	assert.Equal(t, http.StatusUnauthorized, postCanvasEmail("anything", "", valid).Code, "no configured token opens nothing")
	assert.Equal(t, http.StatusUnauthorized, postCanvasEmail("", "", valid).Code)

	t.Setenv("CANVAS_EMAIL_SERVICE_TOKEN", "service-token")
	assert.Equal(t, http.StatusUnauthorized, postCanvasEmail("wrong", "", valid).Code)
	assert.Equal(t, http.StatusForbidden, postCanvasEmail("service-token", "203.0.113.9", valid).Code, "a gateway request is refused even with the token")
}

func TestCanvasInternalEmailValidatesBeforeSending(t *testing.T) {
	t.Setenv("CANVAS_EMAIL_SERVICE_TOKEN", "service-token")
	previous := common.SMTPServer
	t.Cleanup(func() { common.SMTPServer = previous })
	common.SMTPServer = ""

	longSubject := strings.Repeat("字", canvasEmailMaxSubjectChars+1)
	longHTML := strings.Repeat("a", canvasEmailMaxHTMLBytes+1)
	for name, body := range map[string]string{
		"not JSON":           `nope`,
		"no recipient":       `{"subject":"s","html":"b"}`,
		"not an address":     `{"to":"nope","subject":"s","html":"b"}`,
		"several recipients": `{"to":"a@example.com;b@example.com","subject":"s","html":"b"}`,
		"no subject":         `{"to":"a@example.com","html":"b"}`,
		"header injection":   `{"to":"a@example.com","subject":"s\r\nBcc: c@example.com","html":"b"}`,
		"subject too long":   `{"to":"a@example.com","subject":"` + longSubject + `","html":"b"}`,
		"no content":         `{"to":"a@example.com","subject":"s"}`,
		"content too long":   `{"to":"a@example.com","subject":"s","html":"` + longHTML + `"}`,
	} {
		assert.Equal(t, http.StatusBadRequest, postCanvasEmail("service-token", "", body).Code, name)
	}

	assert.Equal(t, http.StatusServiceUnavailable, postCanvasEmail("service-token", "", `{"to":"a@example.com","subject":"s","html":"b"}`).Code, "SMTP not configured")
}

// fakeMailServer answers plain SMTP and hands over each message. A rejecting one refuses every recipient.
func fakeMailServer(t *testing.T, rejectRecipients bool) (string, int, <-chan string) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = listener.Close() })
	messages := make(chan string, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		reader := bufio.NewReader(conn)
		reply := func(line string) { _, _ = io.WriteString(conn, line+"\r\n") }
		reply("220 fake")
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				return
			}
			command := strings.ToUpper(strings.TrimSpace(line))
			switch {
			case strings.HasPrefix(command, "RCPT") && rejectRecipients:
				reply("550 no such mailbox")
			case command == "DATA":
				reply("354 go ahead")
				var data strings.Builder
				for {
					dataLine, err := reader.ReadString('\n')
					if err != nil || strings.TrimRight(dataLine, "\r\n") == "." {
						break
					}
					data.WriteString(dataLine)
				}
				messages <- data.String()
				reply("250 queued")
			case command == "QUIT":
				reply("221 bye")
				return
			default:
				reply("250 ok")
			}
		}
	}()
	address := listener.Addr().(*net.TCPAddr)
	return address.IP.String(), address.Port, messages
}

func useMailServer(t *testing.T, host string, port int) {
	t.Helper()
	server, smtpPort, from, account, token, ssl, startTLS, name := common.SMTPServer, common.SMTPPort, common.SMTPFrom, common.SMTPAccount, common.SMTPToken, common.SMTPSSLEnabled, common.SMTPStartTLSEnabled, common.SystemName
	t.Cleanup(func() {
		common.SMTPServer, common.SMTPPort, common.SMTPFrom, common.SMTPAccount, common.SMTPToken, common.SMTPSSLEnabled, common.SMTPStartTLSEnabled, common.SystemName = server, smtpPort, from, account, token, ssl, startTLS, name
	})
	common.SMTPServer, common.SMTPPort, common.SMTPFrom, common.SMTPAccount, common.SMTPToken = host, port, "sender@example.com", "", ""
	common.SMTPSSLEnabled, common.SMTPStartTLSEnabled = false, false
	common.SystemName = "像素喵片场"
}

func TestCanvasInternalEmailDeliversTheMailInTheSharedFrame(t *testing.T) {
	t.Setenv("CANVAS_EMAIL_SERVICE_TOKEN", "service-token")
	host, port, messages := fakeMailServer(t, false)
	useMailServer(t, host, port)

	response := postCanvasEmail("service-token", "", `{"to":"admin@example.com","subject":"下架提醒","html":"<p>正文</p>"}`)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())

	select {
	case message := <-messages:
		assert.Contains(t, message, "To: admin@example.com\r\n")
		subject := regexp.MustCompile(`Subject: =\?UTF-8\?B\?([^?]+)\?=`).FindStringSubmatch(message)
		require.Len(t, subject, 2)
		decodedSubject, err := base64.StdEncoding.DecodeString(subject[1])
		require.NoError(t, err)
		assert.Equal(t, "【像素喵片场】下架提醒", string(decodedSubject), "the brand prefix is added here")
		_, encoded, found := strings.Cut(message, "\r\n\r\n")
		require.True(t, found)
		body, err := io.ReadAll(quotedprintable.NewReader(strings.NewReader(encoded)))
		require.NoError(t, err)
		assert.Contains(t, string(body), "<p>正文</p>")
		assert.Contains(t, string(body), "此邮件由系统自动发送")
	case <-time.After(2 * time.Second):
		t.Fatal("no mail arrived")
	}
}

func TestCanvasInternalEmailReportsARefusedMailWithoutItsDetails(t *testing.T) {
	t.Setenv("CANVAS_EMAIL_SERVICE_TOKEN", "service-token")
	host, port, _ := fakeMailServer(t, true)
	useMailServer(t, host, port)

	response := postCanvasEmail("service-token", "", `{"to":"admin@example.com","subject":"s","html":"b"}`)
	assert.Equal(t, http.StatusBadGateway, response.Code)
	assert.JSONEq(t, `{"success":false,"code":"EMAIL_DELIVERY_FAILED"}`, response.Body.String())
}

// setupCanvasEmailUsers gives the handler a database with one user that has an address and one that has none.
func setupCanvasEmailUsers(t *testing.T) (withAddress int, withoutAddress int) {
	t.Helper()
	db := setupManageUserTestDB(t)
	customer := model.User{Username: "canvas-mail-customer", Password: "password-1234", DisplayName: "c", Email: "customer@example.com", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "cm01"}
	silent := model.User{Username: "canvas-mail-silent", Password: "password-1234", DisplayName: "s", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "cm02"}
	require.NoError(t, db.Create(&customer).Error)
	require.NoError(t, db.Create(&silent).Error)
	return customer.Id, silent.Id
}

func TestCanvasInternalEmailMailsAUserByIdAndReturnsOnlyAMaskedAddress(t *testing.T) {
	t.Setenv("CANVAS_EMAIL_SERVICE_TOKEN", "service-token")
	withAddress, withoutAddress := setupCanvasEmailUsers(t)
	host, port, messages := fakeMailServer(t, false)
	useMailServer(t, host, port)

	response := postCanvasEmail("service-token", "", fmt.Sprintf(`{"userId":%d,"subject":"违规通知","html":"<p>正文</p>"}`, withAddress))
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.JSONEq(t, `{"success":true,"addressMasked":"c***@example.com"}`, response.Body.String(), "Canvas Cloud never sees the address")
	select {
	case message := <-messages:
		assert.Contains(t, message, "To: customer@example.com\r\n")
	case <-time.After(2 * time.Second):
		t.Fatal("no mail arrived")
	}

	missing := postCanvasEmail("service-token", "", fmt.Sprintf(`{"userId":%d,"subject":"s","html":"b"}`, withoutAddress))
	assert.Equal(t, http.StatusUnprocessableEntity, missing.Code)
	assert.JSONEq(t, `{"success":false,"code":"EMAIL_ADDRESS_MISSING"}`, missing.Body.String())
	assert.Equal(t, http.StatusUnprocessableEntity, postCanvasEmail("service-token", "", `{"userId":999999,"subject":"s","html":"b"}`).Code, "an unknown user has no address either")
}

func TestCanvasInternalEmailTakesExactlyOneRecipient(t *testing.T) {
	t.Setenv("CANVAS_EMAIL_SERVICE_TOKEN", "service-token")
	setupCanvasEmailUsers(t)
	for name, body := range map[string]string{
		"both":          `{"to":"a@example.com","userId":1,"subject":"s","html":"b"}`,
		"zero user":     `{"userId":0,"subject":"s","html":"b"}`,
		"negative user": `{"userId":-3,"subject":"s","html":"b"}`,
		"user as text":  `{"userId":"1","subject":"s","html":"b"}`,
	} {
		assert.Equal(t, http.StatusBadRequest, postCanvasEmail("service-token", "", body).Code, name)
	}
}
