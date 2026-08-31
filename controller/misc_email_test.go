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
)

func TestCanvasAccountEmailWording(t *testing.T) {
	subject, content := buildEmailVerificationMessage("灵猫工坊", "123456", 10)
	if subject != "灵猫工坊 邮箱验证码" {
		t.Fatalf("unexpected verification subject: %q", subject)
	}
	for _, expected := range []string{"验证灵猫工坊账号的邮箱地址", "123456", "10 分钟内有效"} {
		if !strings.Contains(content, expected) {
			t.Fatalf("verification content missing %q: %q", expected, content)
		}
	}

	resetSubject, resetContent := buildPasswordResetMessage("灵猫工坊", "https://canvas.example/reset", 10)
	if resetSubject != "灵猫工坊 密码重置" {
		t.Fatalf("unexpected reset subject: %q", resetSubject)
	}
	for _, expected := range []string{"重置灵猫工坊账号的密码", "https://canvas.example/reset", "10 分钟内有效"} {
		if !strings.Contains(resetContent, expected) {
			t.Fatalf("reset content missing %q: %q", expected, resetContent)
		}
	}
}
