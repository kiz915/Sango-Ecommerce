package com.sangofiora.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class ChatRequest {

    @NotBlank(message = "Message is required")
    @Size(max = 1000, message = "Message cannot exceed 1000 characters")
    private String message;

    @Size(max = 10, message = "History cannot exceed 10 turns")
    private List<ChatMessageTurn> history;

    @Data
    public static class ChatMessageTurn {
        private String role;
        @Size(max = 1000)
        private String content;
    }
}
