package common

import (
	"fmt"
	"html"
	"strings"
)

// The look of every mail, as previewed in canvas-workspace/docs/design/prototypes/email-templates.
// Mail clients ignore most CSS, so this is tables and inline styles. Cloud's email-html.ts repeats the button.
const (
	emailFontFamily  = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif"
	emailActionColor = "#2563EB"
	emailTextColor   = "#374151"
	emailTitleColor  = "#1F2937"
	emailMutedColor  = "#6B7280"
	emailFaintColor  = "#9CA3AF"
	emailLineColor   = "#E5E7EB"
	emailSoftColor   = "#F5F5F7"
)

// EmailPublicAddress is the site address mails link to. It follows the ServerAddress option,
// which common cannot read itself without an import cycle.
var EmailPublicAddress = ""

func emailBrandHeader() string {
	brand := html.EscapeString(NormalizeSystemName(SystemName))
	logo := ""
	if address := strings.TrimRight(strings.TrimSpace(EmailPublicAddress), "/"); address != "" {
		// The alt text stays empty: a client that blocks images still shows the brand name beside it.
		logo = fmt.Sprintf(`<td style="padding-right:10px;line-height:0;"><img src="%s/logo.png" width="36" height="36" alt="" style="display:block;border:0;"></td>`, html.EscapeString(address))
	}
	return fmt.Sprintf(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;"><tr>%s<td style="font-size:20px;line-height:28px;font-weight:700;color:%s;">%s</td></tr></table>`, logo, emailTitleColor, brand)
}

// renderEmailFrame puts a mail's body inside the shared card. The body is trusted HTML: each caller escapes its own values.
func renderEmailFrame(body string) string {
	return fmt.Sprintf(`<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;font-family:%[1]s;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid %[2]s;border-radius:12px;">
<tr><td style="padding:32px 32px 28px;font-size:15px;line-height:24px;color:%[3]s;">
%[4]s
%[5]s
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0"><tr><td style="padding-top:24px;border-bottom:1px dashed %[2]s;font-size:0;line-height:0;">&nbsp;</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;line-height:20px;color:%[6]s;">此邮件由系统自动发送，请勿直接回复。</p>
</td></tr>
</table>
</td></tr>
</table>`, emailFontFamily, emailLineColor, emailTextColor, emailBrandHeader(), body, emailFaintColor)
}

// EmailParagraph is a line of body text. The value is trusted HTML.
func EmailParagraph(value string) string {
	return fmt.Sprintf(`<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:%s;">%s</p>`, emailTextColor, value)
}

// EmailNote is a smaller line below the main content. The value is trusted HTML.
func EmailNote(value string) string {
	return fmt.Sprintf(`<p style="margin:16px 0 0;font-size:13px;line-height:22px;color:%s;">%s</p>`, emailMutedColor, value)
}

// EmailCode shows a verification code. It is spaced with letter spacing, not spaces, so a copied code stays valid.
func EmailCode(code string) string {
	return fmt.Sprintf(`<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:%s;border-radius:8px;"><tr><td align="center" style="padding:24px 12px;font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;color:%s;">%s</td></tr></table>`, emailSoftColor, emailActionColor, html.EscapeString(code))
}

// EmailButton is the main action of a mail.
func EmailButton(label, href string) string {
	return fmt.Sprintf(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0;"><tr><td style="background:%s;border-radius:8px;"><a href="%s" style="display:inline-block;padding:12px 28px;font-size:15px;line-height:22px;font-weight:600;color:#FFFFFF;text-decoration:none;">%s</a></td></tr></table>`, emailActionColor, html.EscapeString(href), html.EscapeString(label))
}

// EmailLink is a full address for a client where the button does not work.
func EmailLink(href string) string {
	escaped := html.EscapeString(href)
	return fmt.Sprintf(`<a href="%s" style="word-break:break-all;color:%s;">%s</a>`, escaped, emailActionColor, escaped)
}
