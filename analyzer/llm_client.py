"""Unified local AI client supporting Ollama and OpenAI-compatible endpoints."""

from __future__ import annotations

import json
import re
from typing import Protocol

import requests


class LLMClient(Protocol):
    def chat_json(self, system_prompt: str, user_prompt: str) -> dict:
        ...


def extract_json_block(raw_text: str) -> dict:
    """Strip <think> tags and markdown fences, then parse JSON."""
    cleaned = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL).strip()
    fence_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, flags=re.DOTALL)
    if fence_match:
        cleaned = fence_match.group(1)
    else:
        obj_match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if obj_match:
            cleaned = obj_match.group(0)
    return json.loads(cleaned)


class LocalLLMClient:
    """HTTP client for Ollama (/api/chat) or OpenAI-compatible (/v1/chat/completions)."""

    def __init__(
        self,
        provider: str = "ollama",
        model: str = "qwen2.5:14b",
        endpoint: str | None = None,
        timeout: int = 180,
    ) -> None:
        self.provider = provider.lower().strip()
        self.model = model
        self.timeout = timeout

        if endpoint:
            self.endpoint = endpoint.rstrip("/")
        elif self.provider == "ollama":
            self.endpoint = "http://localhost:11434"
        elif self.provider == "openai":
            self.endpoint = "http://localhost:1234"
        else:
            raise ValueError(f"Unsupported provider: {provider}")

    def chat_json(self, system_prompt: str, user_prompt: str) -> dict:
        if self.provider == "ollama":
            url = f"{self.endpoint}/api/chat"
            payload = {
                "model": self.model,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.2},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            }
            resp = requests.post(url, json=payload, timeout=self.timeout)
            resp.raise_for_status()
            content = resp.json()["message"]["content"]
            return extract_json_block(content)

        if self.provider == "openai":
            url = f"{self.endpoint}/v1/chat/completions"
            payload = {
                "model": self.model,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            }
            resp = requests.post(url, json=payload, timeout=self.timeout)
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            return extract_json_block(content)

        raise ValueError(f"Unsupported provider: {self.provider}")
