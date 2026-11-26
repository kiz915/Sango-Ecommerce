package com.sangofiora.backend.controller;

import com.sangofiora.backend.dto.ChatRequest;
import com.sangofiora.backend.dto.ChatResponse;
import com.sangofiora.backend.security.UserPrincipal;
import com.sangofiora.backend.service.ChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    @GetMapping("/suggestions")
    public ResponseEntity<Map<String, Object>> suggestions(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(Map.of(
                "suggestions", chatService.getDynamicSuggestions(principal),
                "authenticated", principal != null
        ));
    }

    @PostMapping
    public ResponseEntity<ChatResponse> chat(
            @Valid @RequestBody ChatRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(chatService.chat(request, principal));
    }
}
