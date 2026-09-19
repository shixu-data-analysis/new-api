/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

package controller

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestCanvasAccountEmailWording(t *testing.T) {
	subject, content := buildEmailVerificationMessage("像素喵片场", "123456", 10)
	if subject != "像素喵片场 邮箱验证码" {
		t.Fatalf("unexpected verification subject: %q", subject)
	}
	for _, expected := range []string{"验证像素喵片场账号的邮箱地址", "123456", "10 分钟内有效"} {
		if !strings.Contains(content, expected) {
			t.Fatalf("verification content missing %q: %q", expected, content)
		}
	}

	resetSubject, resetContent := buildPasswordResetMessage("像素喵片场", "https://canvas.example/reset", 10)
	if resetSubject != "像素喵片场 密码重置" {
		t.Fatalf("unexpected reset subject: %q", resetSubject)
	}
	for _, expected := range []string{"重置像素喵片场账号的密码", "https://canvas.example/reset", "10 分钟内有效"} {
		if !strings.Contains(resetContent, expected) {
			t.Fatalf("reset content missing %q: %q", expected, resetContent)
		}
	}
}

func TestCanvasAccountEmailNormalizesRuntimeBrand(t *testing.T) {
	previousName := common.SystemName
	t.Cleanup(func() { common.SystemName = previousName })
	common.SystemName = "New API"

	subject, content := buildEmailVerificationMessage(common.SystemName, "123456", 10)
	if strings.Contains(subject+content, "New API") || !strings.Contains(subject+content, "像素喵片场") {
		t.Fatalf("email leaked retired brand: %q %q", subject, content)
	}
	resetSubject, resetContent := buildPasswordResetMessage(common.SystemName, "https://canvas.example/reset", 10)
	if strings.Contains(resetSubject+resetContent, "New API") || !strings.Contains(resetSubject+resetContent, "像素喵片场") {
		t.Fatalf("password reset email leaked retired brand: %q %q", resetSubject, resetContent)
	}
}
