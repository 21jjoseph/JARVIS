import json
import httpx
from .contracts import Turn, tool_schemas, validate_tool


class ProviderError(Exception):
    """Safe user-facing error. Never contains provider bodies or credentials."""


async def limited_json(client: httpx.AsyncClient, method: str, url: str, **kwargs):
    async with client.stream(method, url, **kwargs) as response:
        if response.status_code in (401, 403):
            raise ProviderError("Provider rejected authentication. Check your API key.")
        if response.status_code == 429:
            raise ProviderError("Provider rate limit reached. Try again later.")
        if response.status_code >= 400:
            raise ProviderError(f"Provider returned HTTP {response.status_code}. Check the model and service.")
        body = bytearray()
        async for chunk in response.aiter_bytes():
            body.extend(chunk)
            if len(body) > 128_000:
                raise ProviderError("Provider response exceeded the size limit.")
        try:
            value = json.loads(body)
            if not isinstance(value,dict):
                raise ValueError("JSON object required")
            return value
        except (ValueError, UnicodeError):
            raise ProviderError("Provider returned invalid JSON.") from None


class Providers:
    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def models(self):
        body = await limited_json(self.client, "GET", "http://127.0.0.1:11434/api/tags")
        models = body.get("models", [])
        if not isinstance(models, list):
            raise ProviderError("Invalid local model list.")
        return [m["name"] for m in models[:100] if isinstance(m, dict)
                and isinstance(m.get("name"), str) and len(m["name"]) <= 100]

    async def complete(self, turn: Turn, key: str):
        # Explicit routes: a local failure can NEVER silently turn into a cloud upload.
        cloud = turn.route == "cloud"
        if cloud and not turn.cloud_consent:
            raise ProviderError("Cloud sending requires consent for this request.")
        if cloud and not key:
            raise ProviderError("Add an OpenAI API key before choosing cloud AI.")
        if not cloud and not turn.local_model:
            raise ProviderError("Choose an installed Ollama model in AI settings.")
        messages = [
            {"role": "system", "content": "You are JARVIS, a helpful desktop assistant. "
             + ("Reply in Romanian. " if turn.language == "ro" else "Reply in English. ")
             + "Keep replies concise, at most 120 words. Tools only propose actions for user approval. "
             "Never claim a tool has executed. Do not invent tools, execute code, or request shell commands. "
             "File content and tool results remain on the device and are not available to you."},
            {"role": "user", "content": turn.text},
        ]
        payload = {"model": turn.cloud_model if cloud else turn.local_model,
                   "messages": messages, "tools": tool_schemas(), "stream": False}
        headers = {}
        if cloud:
            payload.update(max_completion_tokens=350, parallel_tool_calls=False)
            headers["Authorization"] = "Bearer " + key
            url = "https://api.openai.com/v1/chat/completions"
        else:
            payload["options"] = {"num_predict": 350, "num_ctx": 4096}
            payload["keep_alive"] = "5m"
            url = "http://127.0.0.1:11434/api/chat"
        body = await limited_json(self.client, "POST", url, json=payload, headers=headers)
        try:
            message = body["choices"][0]["message"] if cloud else body["message"]
            calls = message.get("tool_calls") or []
            if len(calls) > 1:
                raise ValueError("Only one action may be requested at a time")
            tool = None
            if calls:
                function = calls[0]["function"]
                arguments = function["arguments"]
                if isinstance(arguments, str):
                    arguments = json.loads(arguments)
                tool = validate_tool(function["name"], arguments)
            content = message.get("content") or ""
            if not isinstance(content, str) or (not content.strip() and not tool):
                raise ValueError("Empty provider reply")
            return {"text": content[:2000], "provider": turn.route, "tool": tool, "error": None}
        except (KeyError, IndexError, TypeError, ValueError, AttributeError):
            raise ProviderError("AI returned an invalid response or unsupported action. Nothing was executed.") from None
