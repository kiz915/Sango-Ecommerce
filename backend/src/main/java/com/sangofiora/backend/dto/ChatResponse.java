package com.sangofiora.backend.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class ChatResponse {
    private String reply;
    private String model;
    private List<String> suggestions;
    private boolean aiPowered;
}
