from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Turn(StrictModel):
    version: Literal[1] = 1
    text: str = Field(min_length=1, max_length=4000)
    language: Literal["ro", "en"] = "ro"
    route: Literal["local", "cloud"] = "local"
    local_model: str = Field(default="", max_length=100, pattern=r"^[a-zA-Z0-9_.:/-]*$")
    cloud_model: str = Field(default="gpt-4.1-mini", min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_.:-]+$")
    cloud_consent: bool = False


class Empty(StrictModel):
    pass


class OpenApp(StrictModel):
    app: Literal["calculator", "text_editor", "file_manager"]


class OpenFolder(StrictModel):
    folder: Literal["home", "documents", "downloads"]


class FindFiles(StrictModel):
    query: str = Field(min_length=1, max_length=100, pattern=r"^[^/\\\x00-\x1f]+$")


# The model can propose one of these operations, never a command or a path.
TOOLS = {
    "system_info": (Empty, "Show basic operating system and CPU information locally."),
    "open_app": (OpenApp, "Open or focus Calculator, a text editor or the file manager."),
    "open_folder": (OpenFolder, "Open Home, Documents or Downloads in the file manager."),
    "read_text_file": (Empty, "Let the user choose one small text file to display locally. File contents are never sent to AI."),
    "find_files": (FindFiles, "Find filenames in a folder the user selects. Results stay local."),
}


def tool_schemas():
    return [{"type": "function", "function": {"name": name, "description": description,
             "parameters": model.model_json_schema()}} for name, (model, description) in TOOLS.items()]


def validate_tool(name: str, arguments: dict):
    if name not in TOOLS:
        raise ValueError("Unsupported desktop tool")
    return {"name": name, "arguments": TOOLS[name][0].model_validate(arguments).model_dump()}
