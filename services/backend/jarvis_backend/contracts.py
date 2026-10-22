from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Turn(StrictModel):
    version: Literal[1] = 1
    text: str = Field(min_length=1, max_length=4000)
    language: Literal["ro", "en"] = "ro"
    route: Literal["local", "cloud", "auto"] = "local"
    local_model: str = Field(default="", max_length=100, pattern=r"^[a-zA-Z0-9_.:/-]*$")
    cloud_model: str = Field(default="gpt-4.1-mini", min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_.:-]+$")
    cloud_consent: bool = False
    mode: Literal['local','hybrid','cloud'] = 'local'
    local_backend: Literal['ollama','llama'] = 'ollama'
    local_endpoint: str = Field(default='http://127.0.0.1:8080',max_length=150)
    cloud_provider: Literal['openai','gemini'] = 'openai'
    cloud_enabled: bool = False
    private: bool = False
    share_context: bool = False
    personality: Literal['casual','professional'] = 'casual'
    session_id: str = Field(default='default',max_length=80,pattern=r'^[A-Za-z0-9_-]+$')
    complexity: Literal['auto','simple','complex'] = 'auto'
    input_price: float = Field(default=0,ge=0,le=1000)
    output_price: float = Field(default=0,ge=0,le=1000)
    warning_budget: float = Field(default=0,ge=0,le=1000)


class Empty(StrictModel):
    pass


class OpenApp(StrictModel):
    app: Literal["calculator", "text_editor", "file_manager", "coppeliasim"]


class OpenFolder(StrictModel):
    folder: Literal["home", "documents", "downloads"]


class FindFiles(StrictModel):
    query: str = Field(min_length=1, max_length=100, pattern=r"^[^/\\\x00-\x1f]+$")


# The model can propose one of these operations, never a command or a path.
TOOLS = {
    "system_info": (Empty, "Show basic operating system and CPU information locally."),
    "open_app": (OpenApp, "Open or focus Calculator, a text editor, the file manager or an installed CoppeliaSim application."),
    "open_folder": (OpenFolder, "Open Home, Documents or Downloads in the file manager."),
    "read_text_file": (Empty, "Ask approval, then let the user choose a small text file. Results may go to local AI; cloud sharing needs separate explicit consent."),
    "find_files": (FindFiles, "Ask approval, then find filenames in a user-selected folder. Cloud result sharing needs separate explicit consent."),
}


def tool_schemas():
    return [{"type": "function", "function": {"name": name, "description": description,
             "parameters": model.model_json_schema()}} for name, (model, description) in TOOLS.items()]


def validate_tool(name: str, arguments: dict):
    if name not in TOOLS:
        raise ValueError("Unsupported desktop tool")
    return {"name": name, "arguments": TOOLS[name][0].model_validate(arguments).model_dump()}
