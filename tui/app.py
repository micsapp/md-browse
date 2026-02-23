"""md-browse Terminal UI — full admin interface built with Textual."""
from __future__ import annotations

import os
import tempfile
import subprocess
from pathlib import Path
from datetime import datetime

from textual import on, work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.screen import Screen, ModalScreen
from textual.widgets import (
    Header, Footer, Static, Input, Button, DataTable, TextArea,
    Label, Tree, DirectoryTree, TabbedContent, TabPane,
    LoadingIndicator, Select, Markdown,
)
from textual.containers import (
    Container, Horizontal, Vertical, VerticalScroll, Center,
)
from textual.message import Message

from tui.api import MdBrowseAPI, APIError, ssh_list_dir, ssh_download

# ─── Global state ────────────────────────────────────────────────────────────
api = MdBrowseAPI()


# ═══════════════════════════════════════════════════════════════════════════════
#  MODAL SCREENS
# ═══════════════════════════════════════════════════════════════════════════════

class ConfirmModal(ModalScreen[bool]):
    """Yes/No confirmation dialog."""
    BINDINGS = [Binding("escape", "cancel", "Cancel", show=False)]
    DEFAULT_CSS = """
    ConfirmModal { align: center middle; }
    ConfirmModal > Vertical { width: 50; height: auto; max-height: 14; border: thick $accent; background: $surface; padding: 1 2; }
    ConfirmModal Label { width: 100%; text-align: center; margin-bottom: 1; }
    ConfirmModal Horizontal { align: center middle; height: 3; }
    ConfirmModal Button { margin: 0 1; min-width: 12; }
    """
    def __init__(self, message: str):
        super().__init__()
        self._msg = message

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label(self._msg)
            with Horizontal():
                yield Button("Yes", variant="error", id="yes")
                yield Button("No", variant="primary", id="no")

    @on(Button.Pressed, "#yes")
    def on_yes(self):
        self.dismiss(True)

    @on(Button.Pressed, "#no")
    def on_no(self):
        self.dismiss(False)

    def action_cancel(self):
        self.dismiss(False)


class InputModal(ModalScreen[str | None]):
    """Single-field input modal."""
    BINDINGS = [Binding("escape", "cancel", "Cancel", show=False)]
    DEFAULT_CSS = """
    InputModal { align: center middle; }
    InputModal > Vertical { width: 60; height: auto; max-height: 16; border: thick $accent; background: $surface; padding: 1 2; }
    InputModal Label { width: 100%; margin-bottom: 1; }
    InputModal Input { width: 100%; margin-bottom: 1; }
    InputModal Horizontal { align: center middle; height: 3; }
    InputModal Button { margin: 0 1; min-width: 12; }
    """
    def __init__(self, title: str, placeholder: str = "", default: str = ""):
        super().__init__()
        self._title = title
        self._placeholder = placeholder
        self._default = default

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label(self._title)
            yield Input(value=self._default, placeholder=self._placeholder, id="modal-input")
            with Horizontal():
                yield Button("OK", variant="primary", id="ok")
                yield Button("Cancel", id="cancel")

    def on_mount(self):
        self.query_one("#modal-input", Input).focus()

    @on(Button.Pressed, "#ok")
    def on_ok(self):
        self.dismiss(self.query_one("#modal-input", Input).value)

    @on(Button.Pressed, "#cancel")
    def on_cancel(self):
        self.dismiss(None)

    def action_cancel(self):
        self.dismiss(None)

    @on(Input.Submitted)
    def on_submit(self):
        self.dismiss(self.query_one("#modal-input", Input).value)


class CreateUserModal(ModalScreen[dict | None]):
    BINDINGS = [Binding("escape", "cancel", "Cancel", show=False)]
    DEFAULT_CSS = """
    CreateUserModal { align: center middle; }
    CreateUserModal > Vertical { width: 60; height: auto; max-height: 22; border: thick $accent; background: $surface; padding: 1 2; }
    CreateUserModal Label { width: 100%; margin-bottom: 0; }
    CreateUserModal Input { width: 100%; margin-bottom: 1; }
    CreateUserModal Select { width: 100%; margin-bottom: 1; }
    CreateUserModal Horizontal { align: center middle; height: 3; }
    CreateUserModal Button { margin: 0 1; min-width: 12; }
    """
    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label("Create User")
            yield Label("Username:")
            yield Input(placeholder="username", id="cu-user")
            yield Label("Password:")
            yield Input(placeholder="password", password=True, id="cu-pass")
            yield Label("Role:")
            yield Select([("admin", "admin"), ("editor", "editor"), ("viewer", "viewer")], value="viewer", id="cu-role")
            with Horizontal():
                yield Button("Create", variant="primary", id="ok")
                yield Button("Cancel", id="cancel")

    def on_mount(self):
        self.query_one("#cu-user", Input).focus()

    @on(Button.Pressed, "#ok")
    def on_ok(self):
        u = self.query_one("#cu-user", Input).value.strip()
        p = self.query_one("#cu-pass", Input).value
        r = self.query_one("#cu-role", Select).value
        if not u or not p:
            self.notify("Username and password required", severity="error")
            return
        self.dismiss({"username": u, "password": p, "role": r})

    @on(Button.Pressed, "#cancel")
    def on_cancel(self):
        self.dismiss(None)

    def action_cancel(self):
        self.dismiss(None)


class EditDocumentModal(ModalScreen[dict | None]):
    BINDINGS = [Binding("escape", "cancel", "Cancel", show=False)]
    DEFAULT_CSS = """
    EditDocumentModal { align: center middle; }
    EditDocumentModal > Vertical { width: 80; height: 85%; border: thick $accent; background: $surface; padding: 1 2; }
    EditDocumentModal Label { width: 100%; margin-bottom: 0; }
    EditDocumentModal Input { width: 100%; margin-bottom: 1; }
    EditDocumentModal TextArea { width: 100%; height: 1fr; margin-bottom: 1; }
    EditDocumentModal Horizontal { align: center middle; height: 3; }
    EditDocumentModal Button { margin: 0 1; min-width: 12; }
    """
    def __init__(self, doc: dict):
        super().__init__()
        self._doc = doc

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label(f"Edit: {self._doc.get('title', '')}")
            yield Label("Title:")
            yield Input(value=self._doc.get("title", ""), id="ed-title")
            yield Label("Tags (comma-separated):")
            yield Input(value=", ".join(self._doc.get("tags", [])), id="ed-tags")
            yield Label("Category:")
            yield Input(value=self._doc.get("category", ""), id="ed-cat")
            yield Label("Content (Markdown):")
            yield TextArea(self._doc.get("content_md", ""), language="markdown", id="ed-content")
            yield Label("Change note:")
            yield Input(placeholder="what changed?", id="ed-note")
            with Horizontal():
                yield Button("Save", variant="primary", id="ok")
                yield Button("$EDITOR", variant="warning", id="editor")
                yield Button("Cancel", id="cancel")

    def on_mount(self):
        self.query_one("#ed-title", Input).focus()

    @on(Button.Pressed, "#ok")
    def on_ok(self):
        tags_raw = self.query_one("#ed-tags", Input).value
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
        self.dismiss({
            "title": self.query_one("#ed-title", Input).value,
            "tags": tags,
            "category": self.query_one("#ed-cat", Input).value,
            "content_md": self.query_one("#ed-content", TextArea).text,
            "change_note": self.query_one("#ed-note", Input).value,
        })

    @on(Button.Pressed, "#editor")
    def on_external_editor(self):
        """Open content in $EDITOR, then reload into TextArea."""
        content = self.query_one("#ed-content", TextArea).text
        editor = os.environ.get("EDITOR", "nano")
        tmp = tempfile.NamedTemporaryFile(suffix=".md", mode="w", delete=False)
        tmp.write(content)
        tmp.close()
        self.app.suspend()
        try:
            subprocess.call([editor, tmp.name])
            with open(tmp.name) as f:
                new_content = f.read()
            self.query_one("#ed-content", TextArea).load_text(new_content)
        finally:
            os.unlink(tmp.name)
            self.app.resume()

    @on(Button.Pressed, "#cancel")
    def on_cancel(self):
        self.dismiss(None)

    def action_cancel(self):
        self.dismiss(None)


class CreateFolderModal(ModalScreen[dict | None]):
    BINDINGS = [Binding("escape", "cancel", "Cancel", show=False)]
    DEFAULT_CSS = """
    CreateFolderModal { align: center middle; }
    CreateFolderModal > Vertical { width: 60; height: auto; max-height: 18; border: thick $accent; background: $surface; padding: 1 2; }
    CreateFolderModal Label { width: 100%; margin-bottom: 0; }
    CreateFolderModal Input { width: 100%; margin-bottom: 1; }
    CreateFolderModal Select { width: 100%; margin-bottom: 1; }
    CreateFolderModal Horizontal { align: center middle; height: 3; }
    CreateFolderModal Button { margin: 0 1; min-width: 12; }
    """
    def __init__(self, folders: list):
        super().__init__()
        self._folders = folders

    def compose(self) -> ComposeResult:
        opts = [("(root)", None)] + [(f["name"], f["id"]) for f in self._folders]
        with Vertical():
            yield Label("Create Folder")
            yield Label("Name:")
            yield Input(placeholder="folder name", id="cf-name")
            yield Label("Parent:")
            yield Select(opts, value=None, id="cf-parent")
            with Horizontal():
                yield Button("Create", variant="primary", id="ok")
                yield Button("Cancel", id="cancel")

    def on_mount(self):
        self.query_one("#cf-name", Input).focus()

    @on(Button.Pressed, "#ok")
    def on_ok(self):
        name = self.query_one("#cf-name", Input).value.strip()
        if not name:
            self.notify("Folder name required", severity="error")
            return
        parent = self.query_one("#cf-parent", Select).value
        self.dismiss({"name": name, "parent_id": parent if parent != Select.BLANK else None})

    @on(Button.Pressed, "#cancel")
    def on_cancel(self):
        self.dismiss(None)

    def action_cancel(self):
        self.dismiss(None)


class UploadLocalModal(ModalScreen[str | None]):
    """Browse local filesystem to select a .md file."""
    BINDINGS = [Binding("escape", "cancel", "Cancel", show=False)]
    DEFAULT_CSS = """
    UploadLocalModal { align: center middle; }
    UploadLocalModal > Vertical { width: 80; height: 80%; border: thick $accent; background: $surface; padding: 1 2; }
    UploadLocalModal DirectoryTree { height: 1fr; }
    UploadLocalModal #selected-path { height: 3; margin: 1 0; }
    UploadLocalModal Horizontal { align: center middle; height: 3; }
    UploadLocalModal Button { margin: 0 1; min-width: 12; }
    """
    def __init__(self, start_path: str | None = None):
        super().__init__()
        self._start = start_path or str(Path.home())
        self._selected: str | None = None

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label("Select a Markdown file (.md)")
            yield DirectoryTree(self._start, id="local-tree")
            yield Label("", id="selected-path")
            with Horizontal():
                yield Button("Upload", variant="primary", id="ok")
                yield Button("Cancel", id="cancel")

    @on(DirectoryTree.FileSelected)
    def file_selected(self, event: DirectoryTree.FileSelected):
        path = str(event.path)
        self._selected = path
        self.query_one("#selected-path", Label).update(f"Selected: {path}")

    @on(Button.Pressed, "#ok")
    def on_ok(self):
        if not self._selected:
            self.notify("Select a file first", severity="warning")
            return
        if not self._selected.endswith((".md", ".markdown")):
            self.notify("Only .md/.markdown files allowed", severity="error")
            return
        self.dismiss(self._selected)

    @on(Button.Pressed, "#cancel")
    def on_cancel(self):
        self.dismiss(None)

    def action_cancel(self):
        self.dismiss(None)


class SSHBrowserModal(ModalScreen[str | None]):
    """Browse remote filesystem via SSH and download a .md file."""
    BINDINGS = [Binding("escape", "cancel", "Cancel", show=False)]
    DEFAULT_CSS = """
    SSHBrowserModal { align: center middle; }
    SSHBrowserModal > Vertical { width: 80; height: 80%; border: thick $accent; background: $surface; padding: 1 2; }
    SSHBrowserModal Input { width: 100%; margin-bottom: 1; }
    SSHBrowserModal DataTable { height: 1fr; }
    SSHBrowserModal #ssh-status { height: 3; margin: 1 0; }
    SSHBrowserModal Horizontal { align: center middle; height: 3; }
    SSHBrowserModal Button { margin: 0 1; min-width: 12; }
    """
    def __init__(self):
        super().__init__()
        self._host = ""
        self._user = ""
        self._cwd = "/"
        self._selected_file: str | None = None

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label("SSH Remote File Browser")
            with Horizontal():
                yield Input(placeholder="user", id="ssh-user", classes="ssh-field")
                yield Label("@")
                yield Input(placeholder="hostname", id="ssh-host", classes="ssh-field")
                yield Label(":")
                yield Input(value="/", placeholder="/path", id="ssh-path", classes="ssh-field")
                yield Button("Connect", variant="primary", id="ssh-connect")
            yield DataTable(id="ssh-files")
            yield Label("", id="ssh-status")
            with Horizontal():
                yield Button("Download & Upload", variant="success", id="ok")
                yield Button("Cancel", id="cancel")

    def on_mount(self):
        table = self.query_one("#ssh-files", DataTable)
        table.add_columns("Type", "Name", "Size", "Permissions")
        table.cursor_type = "row"
        self.query_one("#ssh-user", Input).focus()

    @on(Button.Pressed, "#ssh-connect")
    def do_connect(self):
        self._user = self.query_one("#ssh-user", Input).value.strip()
        self._host = self.query_one("#ssh-host", Input).value.strip()
        self._cwd = self.query_one("#ssh-path", Input).value.strip() or "/"
        if not self._host:
            self.notify("Hostname required", severity="error")
            return
        self._load_dir()

    @work(thread=True)
    def _load_dir(self):
        try:
            entries = ssh_list_dir(self._host, self._cwd, self._user or None)
            self.app.call_from_thread(self._populate_table, entries)
        except Exception as e:
            self.app.call_from_thread(self.notify, f"SSH error: {e}", severity="error")

    def _populate_table(self, entries):
        table = self.query_one("#ssh-files", DataTable)
        table.clear()
        # Add parent directory entry
        table.add_row("📁", "..", "", "", key="__parent__")
        for e in sorted(entries, key=lambda x: (not x["is_dir"], x["name"])):
            icon = "📁" if e["is_dir"] else "📄"
            table.add_row(icon, e["name"], e["size"], e["perms"], key=e["name"])
        self.query_one("#ssh-status", Label).update(f"Path: {self._cwd}  ({len(entries)} items)")

    @on(DataTable.RowSelected, "#ssh-files")
    def row_selected(self, event: DataTable.RowSelected):
        if event.row_key is None:
            return
        name = str(event.row_key.value)
        if name == "__parent__":
            self._cwd = str(Path(self._cwd).parent)
            self.query_one("#ssh-path", Input).value = self._cwd
            self._load_dir()
            return
        row_data = self.query_one("#ssh-files", DataTable).get_row(event.row_key)
        is_dir = row_data[0] == "📁"
        if is_dir:
            self._cwd = str(Path(self._cwd) / name)
            self.query_one("#ssh-path", Input).value = self._cwd
            self._load_dir()
        else:
            full_path = str(Path(self._cwd) / name)
            self._selected_file = full_path
            self.query_one("#ssh-status", Label).update(f"Selected: {full_path}")

    @on(Button.Pressed, "#ok")
    def on_ok(self):
        if not self._selected_file:
            self.notify("Select a file first", severity="warning")
            return
        if not self._selected_file.endswith((".md", ".markdown")):
            self.notify("Only .md/.markdown files", severity="error")
            return
        self._download_and_dismiss()

    @work(thread=True)
    def _download_and_dismiss(self):
        try:
            local_path = ssh_download(self._host, self._selected_file, self._user or None)
            self.app.call_from_thread(self.dismiss, local_path)
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Download failed: {e}", severity="error")

    @on(Button.Pressed, "#cancel")
    def on_cancel(self):
        self.dismiss(None)

    def action_cancel(self):
        self.dismiss(None)


class VersionsModal(ModalScreen[int | None]):
    """Show document version history and allow rollback."""
    BINDINGS = [Binding("escape", "cancel", "Cancel", show=False)]
    DEFAULT_CSS = """
    VersionsModal { align: center middle; }
    VersionsModal > Vertical { width: 80; height: 70%; border: thick $accent; background: $surface; padding: 1 2; }
    VersionsModal DataTable { height: 1fr; }
    VersionsModal Horizontal { align: center middle; height: 3; }
    VersionsModal Button { margin: 0 1; min-width: 14; }
    """
    def __init__(self, doc_id: str, versions: list):
        super().__init__()
        self._doc_id = doc_id
        self._versions = versions

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label(f"Version History — {self._doc_id}")
            yield DataTable(id="ver-table")
            with Horizontal():
                yield Button("Rollback Selected", variant="warning", id="rollback")
                yield Button("Close", id="cancel")

    def on_mount(self):
        table = self.query_one("#ver-table", DataTable)
        table.add_columns("Ver", "By", "Date", "Note", "Checksum")
        table.cursor_type = "row"
        for v in reversed(self._versions):
            table.add_row(
                str(v["version_number"]),
                v.get("created_by", ""),
                v.get("created_at", "")[:19],
                v.get("change_note", ""),
                v.get("checksum", "")[:12],
                key=str(v["version_number"]),
            )

    @on(Button.Pressed, "#rollback")
    def on_rollback(self):
        table = self.query_one("#ver-table", DataTable)
        row_key = table.cursor_row
        if row_key is None:
            return
        # Get version number from cursor row
        row = table.get_row_at(row_key)
        ver = int(row[0])
        self.dismiss(ver)

    @on(Button.Pressed, "#cancel")
    def on_cancel(self):
        self.dismiss(None)

    def action_cancel(self):
        self.dismiss(None)


# ═══════════════════════════════════════════════════════════════════════════════
#  LOGIN SCREEN
# ═══════════════════════════════════════════════════════════════════════════════

class LoginScreen(Screen):
    DEFAULT_CSS = """
    LoginScreen { align: center middle; }
    LoginScreen > Vertical { width: 50; height: auto; max-height: 22; border: thick $accent; background: $surface; padding: 2 4; }
    LoginScreen Label { width: 100%; text-align: center; margin-bottom: 1; }
    LoginScreen .field-label { text-align: left; margin-bottom: 0; }
    LoginScreen Input { width: 100%; margin-bottom: 1; }
    LoginScreen Button { width: 100%; margin-top: 1; }
    LoginScreen #login-error { color: $error; text-align: center; }
    LoginScreen #server-url { margin-bottom: 1; }
    """
    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label("🔖 md-browse TUI")
            yield Label("Server URL:", classes="field-label")
            yield Input(value=api.base_url, placeholder="http://localhost:3001", id="server-url")
            yield Label("Username:", classes="field-label")
            yield Input(placeholder="admin", id="username")
            yield Label("Password:", classes="field-label")
            yield Input(placeholder="password", password=True, id="password")
            yield Button("Login", variant="primary", id="login-btn")
            yield Label("", id="login-error")

    def on_mount(self):
        self.query_one("#username", Input).focus()

    @on(Button.Pressed, "#login-btn")
    def do_login(self):
        self._start_login()

    @on(Input.Submitted)
    def on_submit(self):
        self._start_login()

    def _start_login(self):
        url = self.query_one("#server-url", Input).value.strip()
        user = self.query_one("#username", Input).value.strip()
        pwd = self.query_one("#password", Input).value
        if url:
            api.base_url = url.rstrip("/")
        self._try_login(user, pwd)

    @work(thread=True)
    def _try_login(self, user: str, pwd: str):
        try:
            data = api.login(user, pwd)
            self.app.call_from_thread(self._on_login_ok, data)
        except Exception as e:
            self.app.call_from_thread(self._show_error, str(e))

    def _on_login_ok(self, data):
        self.app.user_info = data
        self.app.switch_screen("main")

    def _show_error(self, msg):
        self.query_one("#login-error", Label).update(f"❌ {msg}")


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN SCREEN
# ═══════════════════════════════════════════════════════════════════════════════

NAV_ITEMS = [
    ("documents", "📄 Documents"),
    ("search", "🔍 Search"),
    ("folders", "📁 Folders"),
    ("users", "👥 Users"),
    ("settings", "⚙️  Settings"),
    ("audit", "📋 Audit Logs"),
]


class MainScreen(Screen):
    BINDINGS = [
        Binding("d", "show_section('documents')", "Documents"),
        Binding("s", "show_section('search')", "Search"),
        Binding("f", "show_section('folders')", "Folders"),
        Binding("u", "show_section('users')", "Users"),
        Binding("a", "show_section('audit')", "Audit"),
        Binding("n", "new_document", "Upload"),
        Binding("r", "refresh", "Refresh"),
        Binding("escape", "go_back", "Back", show=True),
        Binding("q", "quit", "Quit"),
    ]

    DEFAULT_CSS = """
    MainScreen { layout: horizontal; }
    #sidebar { width: 22; height: 100%; background: $panel; border-right: tall $accent; padding: 1; }
    #sidebar .nav-btn { width: 100%; margin-bottom: 0; height: 3; }
    #sidebar .nav-btn.-active { background: $accent; }
    #sidebar #user-info { margin-bottom: 1; text-align: center; }
    #content { width: 1fr; height: 100%; padding: 0 1; }
    #content-area { height: 1fr; }

    /* Sections */
    .section { display: none; height: 100%; }
    .section.-visible { display: block; }
    .section-header { height: 3; margin-bottom: 1; }
    .section-header Label { text-style: bold; }
    .section-header Button { min-width: 10; }

    /* Doc detail */
    #doc-detail { display: none; height: 100%; }
    #doc-detail.-visible { display: block; }
    #doc-list-section.-hidden { display: none; }
    """

    current_section = "documents"

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Container(id="main-layout"):
            with Vertical(id="sidebar"):
                yield Label("", id="user-info")
                for key, label in NAV_ITEMS:
                    yield Button(label, id=f"nav-{key}", classes="nav-btn")
            with Vertical(id="content"):
                # -- Documents section --
                with Vertical(id="sec-documents", classes="section -visible"):
                    with Horizontal(classes="section-header"):
                        yield Label("Documents")
                        yield Button("+ Upload Local", variant="primary", id="btn-upload-local")
                        yield Button("+ Upload SSH", variant="warning", id="btn-upload-ssh")
                    yield DataTable(id="doc-table")
                # -- Document detail (overlay replaces doc list) --
                with VerticalScroll(id="doc-detail"):
                    with Horizontal(classes="section-header"):
                        yield Button("← Back", id="btn-back-docs")
                        yield Button("Edit", variant="primary", id="btn-edit-doc")
                        yield Button("Versions", variant="default", id="btn-versions")
                        yield Button("Delete", variant="error", id="btn-delete-doc")
                    yield Markdown("", id="doc-md-content")
                    yield Static("", id="doc-meta")
                # -- Search section --
                with Vertical(id="sec-search", classes="section"):
                    with Horizontal(classes="section-header"):
                        yield Label("Search")
                    yield Input(placeholder="Type to search…", id="search-input")
                    yield DataTable(id="search-table")
                # -- Folders section --
                with Vertical(id="sec-folders", classes="section"):
                    with Horizontal(classes="section-header"):
                        yield Label("Folders")
                        yield Button("+ New Folder", variant="primary", id="btn-new-folder")
                        yield Button("Rename", id="btn-rename-folder")
                        yield Button("Delete", variant="error", id="btn-delete-folder")
                    yield DataTable(id="folder-table")
                # -- Users section --
                with Vertical(id="sec-users", classes="section"):
                    with Horizontal(classes="section-header"):
                        yield Label("User Management")
                        yield Button("+ New User", variant="primary", id="btn-new-user")
                    yield DataTable(id="user-table")
                # -- Settings section --
                with Vertical(id="sec-settings", classes="section"):
                    with Horizontal(classes="section-header"):
                        yield Label("Settings")
                    with VerticalScroll():
                        with Horizontal():
                            yield Label("Registration enabled: ")
                            yield Button("Toggle", variant="primary", id="btn-toggle-reg")
                        yield Static("", id="settings-display")
                # -- Audit section --
                with Vertical(id="sec-audit", classes="section"):
                    with Horizontal(classes="section-header"):
                        yield Label("Audit Logs")
                        yield Button("Refresh", id="btn-refresh-audit")
                    yield DataTable(id="audit-table")
        yield Footer()

    def on_mount(self):
        info = getattr(self.app, "user_info", {})
        self.query_one("#user-info", Label).update(f"👤 {info.get('username', '?')} [{info.get('role', '?')}]")
        self._init_tables()
        self._show_section("documents")
        self._load_documents()

    # ── Table init ──
    def _init_tables(self):
        dt = self.query_one("#doc-table", DataTable)
        dt.add_columns("Title", "Category", "Tags", "Folder", "Updated")
        dt.cursor_type = "row"

        st = self.query_one("#search-table", DataTable)
        st.add_columns("Title", "Category", "Snippet")
        st.cursor_type = "row"

        ft = self.query_one("#folder-table", DataTable)
        ft.add_columns("Name", "Parent", "Created", "ID")
        ft.cursor_type = "row"

        ut = self.query_one("#user-table", DataTable)
        ut.add_columns("Username", "Role", "Created")
        ut.cursor_type = "row"

        at = self.query_one("#audit-table", DataTable)
        at.add_columns("Time", "Actor", "Action", "Resource", "ID")
        at.cursor_type = "row"

    # ── Navigation ──
    def _show_section(self, name: str):
        self.current_section = name
        for key, _ in NAV_ITEMS:
            sec = self.query_one(f"#sec-{key}")
            sec.set_class(key == name, "-visible")
            btn = self.query_one(f"#nav-{key}", Button)
            btn.set_class(key == name, "-active")
        self.query_one("#doc-detail").remove_class("-visible")

    def action_show_section(self, name: str):
        self._show_section(name)
        self._load_section(name)

    def _load_section(self, name: str):
        loaders = {
            "documents": self._load_documents,
            "search": lambda: None,
            "folders": self._load_folders,
            "users": self._load_users,
            "settings": self._load_settings,
            "audit": self._load_audit,
        }
        loaders.get(name, lambda: None)()

    @on(Button.Pressed, ".nav-btn")
    def nav_pressed(self, event: Button.Pressed):
        key = event.button.id.replace("nav-", "")
        self._show_section(key)
        self._load_section(key)

    def action_refresh(self):
        self._load_section(self.current_section)

    def action_go_back(self):
        """ESC goes back: doc detail → doc list, or non-documents section → documents."""
        detail = self.query_one("#doc-detail")
        if "-visible" in detail.classes:
            self.back_to_docs()
        elif self.current_section != "documents":
            self._show_section("documents")
            self._load_section("documents")

    def action_quit(self):
        self.app.exit()

    # ── Documents ──
    @work(thread=True)
    def _load_documents(self):
        try:
            data = api.list_documents(page_size=100)
            self.app.call_from_thread(self._populate_docs, data)
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    def _populate_docs(self, data):
        table = self.query_one("#doc-table", DataTable)
        table.clear()
        self._doc_list = data.get("data", [])
        for doc in self._doc_list:
            table.add_row(
                doc.get("title", "")[:40],
                doc.get("category", ""),
                ", ".join(doc.get("tags", []))[:30],
                doc.get("folder_id", "") or "(root)",
                doc.get("updated_at", "")[:19],
                key=doc["id"],
            )

    @on(DataTable.RowSelected, "#doc-table")
    def doc_selected(self, event: DataTable.RowSelected):
        if event.row_key:
            self._view_document(str(event.row_key.value))

    @work(thread=True)
    def _view_document(self, doc_id: str):
        try:
            doc = api.get_document(doc_id)
            self.app.call_from_thread(self._show_doc_detail, doc)
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    def _show_doc_detail(self, doc: dict):
        self._current_doc = doc
        self.query_one("#sec-documents").remove_class("-visible")
        detail = self.query_one("#doc-detail")
        detail.add_class("-visible")

        md_content = doc.get("content_md", "")
        self.query_one("#doc-md-content", Markdown).update(md_content)

        meta_lines = [
            f"**ID:** {doc.get('id', '')}",
            f"**Category:** {doc.get('category', '')}",
            f"**Tags:** {', '.join(doc.get('tags', []))}",
            f"**Version:** {doc.get('latest_version', '')}",
            f"**Visibility:** {doc.get('visibility', '')}",
            f"**Created by:** {doc.get('created_by', '')}",
            f"**Created:** {doc.get('created_at', '')[:19]}",
            f"**Updated:** {doc.get('updated_at', '')[:19]}",
        ]
        self.query_one("#doc-meta", Static).update("\n".join(meta_lines))

    @on(Button.Pressed, "#btn-back-docs")
    def back_to_docs(self):
        self.query_one("#doc-detail").remove_class("-visible")
        self.query_one("#sec-documents").add_class("-visible")

    @on(Button.Pressed, "#btn-edit-doc")
    def edit_doc(self):
        doc = getattr(self, "_current_doc", None)
        if not doc:
            return
        self.app.push_screen(EditDocumentModal(doc), callback=self._on_edit_done)

    def _on_edit_done(self, result):
        if result is None:
            return
        doc = self._current_doc
        self._do_update_doc(doc["id"], result)

    @work(thread=True)
    def _do_update_doc(self, doc_id, updates):
        try:
            api.update_document(doc_id, **updates)
            self.app.call_from_thread(self.notify, "Document updated", severity="information")
            doc = api.get_document(doc_id)
            self.app.call_from_thread(self._show_doc_detail, doc)
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    @on(Button.Pressed, "#btn-delete-doc")
    def delete_doc(self):
        doc = getattr(self, "_current_doc", None)
        if not doc:
            return
        self.app.push_screen(ConfirmModal(f"Delete '{doc.get('title')}'?"), callback=self._on_delete_confirmed)

    def _on_delete_confirmed(self, confirmed):
        if not confirmed:
            return
        self._do_delete_doc(self._current_doc["id"])

    @work(thread=True)
    def _do_delete_doc(self, doc_id):
        try:
            api.delete_document(doc_id)
            self.app.call_from_thread(self.notify, "Deleted", severity="information")
            self.app.call_from_thread(self.back_to_docs)
            self._load_documents()
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    @on(Button.Pressed, "#btn-versions")
    def show_versions(self):
        doc = getattr(self, "_current_doc", None)
        if not doc:
            return
        self._fetch_versions(doc["id"])

    @work(thread=True)
    def _fetch_versions(self, doc_id):
        try:
            data = api.list_versions(doc_id)
            versions = data.get("versions", [])
            self.app.call_from_thread(
                self.app.push_screen,
                VersionsModal(doc_id, versions),
                self._on_rollback_selected,
            )
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    def _on_rollback_selected(self, version):
        if version is None:
            return
        self._do_rollback(self._current_doc["id"], version)

    @work(thread=True)
    def _do_rollback(self, doc_id, version):
        try:
            api.rollback(doc_id, version)
            self.app.call_from_thread(self.notify, f"Rolled back to v{version}", severity="information")
            doc = api.get_document(doc_id)
            self.app.call_from_thread(self._show_doc_detail, doc)
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    # ── Upload ──
    def action_new_document(self):
        self.app.push_screen(UploadLocalModal(), callback=self._on_local_file_selected)

    @on(Button.Pressed, "#btn-upload-local")
    def upload_local(self):
        self.app.push_screen(UploadLocalModal(), callback=self._on_local_file_selected)

    @on(Button.Pressed, "#btn-upload-ssh")
    def upload_ssh(self):
        self.app.push_screen(SSHBrowserModal(), callback=self._on_ssh_file_downloaded)

    def _on_local_file_selected(self, path):
        if path:
            self._do_upload(path, cleanup=False)

    def _on_ssh_file_downloaded(self, path):
        if path:
            self._do_upload(path, cleanup=True)

    @work(thread=True)
    def _do_upload(self, file_path, cleanup=False):
        try:
            api.upload_document(file_path)
            self.app.call_from_thread(self.notify, f"Uploaded: {os.path.basename(file_path)}", severity="information")
            if cleanup:
                os.unlink(file_path)
            self._load_documents()
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Upload error: {e}", severity="error")

    # ── Search ──
    @on(Input.Submitted, "#search-input")
    def do_search(self, event: Input.Submitted):
        q = event.value.strip()
        if q:
            self._run_search(q)

    @work(thread=True)
    def _run_search(self, query):
        try:
            data = api.search(query)
            self.app.call_from_thread(self._populate_search, data)
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    def _populate_search(self, data):
        table = self.query_one("#search-table", DataTable)
        table.clear()
        self._search_results = data.get("data", [])
        for doc in self._search_results:
            table.add_row(
                doc.get("title", "")[:40],
                doc.get("category", ""),
                doc.get("snippet", "")[:60],
                key=doc["id"],
            )

    @on(DataTable.RowSelected, "#search-table")
    def search_result_selected(self, event: DataTable.RowSelected):
        if event.row_key:
            self._show_section("documents")
            self._view_document(str(event.row_key.value))

    # ── Folders ──
    @work(thread=True)
    def _load_folders(self):
        try:
            folders = api.list_folders()
            self.app.call_from_thread(self._populate_folders, folders)
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    def _populate_folders(self, folders):
        self._folder_list = folders
        table = self.query_one("#folder-table", DataTable)
        table.clear()
        folder_map = {f["id"]: f for f in folders}
        for f in folders:
            parent_name = folder_map.get(f.get("parent_id"), {}).get("name", "(root)")
            table.add_row(
                f.get("name", ""),
                parent_name,
                f.get("created_at", "")[:19],
                f.get("id", "")[:12],
                key=f["id"],
            )

    @on(Button.Pressed, "#btn-new-folder")
    def new_folder(self):
        folders = getattr(self, "_folder_list", [])
        self.app.push_screen(CreateFolderModal(folders), callback=self._on_create_folder)

    def _on_create_folder(self, result):
        if result:
            self._do_create_folder(result)

    @work(thread=True)
    def _do_create_folder(self, data):
        try:
            api.create_folder(data["name"], data.get("parent_id"))
            self.app.call_from_thread(self.notify, f"Folder '{data['name']}' created", severity="information")
            self._load_folders()
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    @on(Button.Pressed, "#btn-rename-folder")
    def rename_folder(self):
        table = self.query_one("#folder-table", DataTable)
        row_key = table.cursor_row
        if row_key is None:
            return
        row = table.get_row_at(row_key)
        folder_name = row[0]
        folder_id = None
        for f in getattr(self, "_folder_list", []):
            if f["name"] == folder_name:
                folder_id = f["id"]
                break
        if folder_id:
            self._rename_folder_id = folder_id
            self.app.push_screen(InputModal("Rename folder", default=folder_name), callback=self._on_rename_folder)

    def _on_rename_folder(self, new_name):
        if new_name and hasattr(self, "_rename_folder_id"):
            self._do_rename_folder(self._rename_folder_id, new_name)

    @work(thread=True)
    def _do_rename_folder(self, folder_id, name):
        try:
            api.update_folder(folder_id, name=name)
            self.app.call_from_thread(self.notify, "Folder renamed", severity="information")
            self._load_folders()
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    @on(Button.Pressed, "#btn-delete-folder")
    def delete_folder(self):
        table = self.query_one("#folder-table", DataTable)
        row_key = table.cursor_row
        if row_key is None:
            return
        row = table.get_row_at(row_key)
        folder_name = row[0]
        folder_id = None
        for f in getattr(self, "_folder_list", []):
            if f["name"] == folder_name:
                folder_id = f["id"]
                break
        if folder_id:
            self._delete_folder_id = folder_id
            self.app.push_screen(ConfirmModal(f"Delete folder '{folder_name}'?"), callback=self._on_delete_folder)

    def _on_delete_folder(self, confirmed):
        if confirmed and hasattr(self, "_delete_folder_id"):
            self._do_delete_folder(self._delete_folder_id)

    @work(thread=True)
    def _do_delete_folder(self, folder_id):
        try:
            api.delete_folder(folder_id)
            self.app.call_from_thread(self.notify, "Folder deleted", severity="information")
            self._load_folders()
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    # ── Users ──
    @work(thread=True)
    def _load_users(self):
        try:
            users = api.list_users()
            self.app.call_from_thread(self._populate_users, users)
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    def _populate_users(self, users):
        self._user_list = users
        table = self.query_one("#user-table", DataTable)
        table.clear()
        for u in users:
            table.add_row(
                u.get("username", ""),
                u.get("role", ""),
                u.get("created_at", "")[:19],
                key=u["username"],
            )

    @on(Button.Pressed, "#btn-new-user")
    def new_user(self):
        self.app.push_screen(CreateUserModal(), callback=self._on_create_user)

    def _on_create_user(self, result):
        if result:
            self._do_create_user(result)

    @work(thread=True)
    def _do_create_user(self, data):
        try:
            api.create_user(data["username"], data["password"], data["role"])
            self.app.call_from_thread(self.notify, f"User '{data['username']}' created", severity="information")
            self._load_users()
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    @on(DataTable.RowSelected, "#user-table")
    def user_selected(self, event: DataTable.RowSelected):
        if not event.row_key:
            return
        username = str(event.row_key.value)
        self._selected_username = username
        # Show action menu for user
        user = next((u for u in getattr(self, "_user_list", []) if u["username"] == username), None)
        if not user:
            return
        self.app.push_screen(UserActionModal(user), callback=self._on_user_action)

    def _on_user_action(self, result):
        if not result:
            return
        action = result.get("action")
        username = result.get("username")
        if action == "change_role":
            self._do_update_user(username, role=result["role"])
        elif action == "change_password":
            self._do_update_user(username, password=result["password"])
        elif action == "delete":
            self.app.push_screen(ConfirmModal(f"Delete user '{username}'?"), callback=lambda ok: ok and self._do_delete_user(username))

    @work(thread=True)
    def _do_update_user(self, username, role=None, password=None):
        try:
            api.update_user(username, role=role, password=password)
            self.app.call_from_thread(self.notify, f"User '{username}' updated", severity="information")
            self._load_users()
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    @work(thread=True)
    def _do_delete_user(self, username):
        try:
            api.delete_user(username)
            self.app.call_from_thread(self.notify, f"User '{username}' deleted", severity="information")
            self._load_users()
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    # ── Settings ──
    @work(thread=True)
    def _load_settings(self):
        try:
            settings = api.get_settings()
            self.app.call_from_thread(self._show_settings, settings)
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    def _show_settings(self, settings):
        self._current_settings = settings
        lines = [f"{k}: {v}" for k, v in settings.items()]
        self.query_one("#settings-display", Static).update("\n".join(lines))

    @on(Button.Pressed, "#btn-toggle-reg")
    def toggle_registration(self):
        settings = getattr(self, "_current_settings", {})
        new_val = not settings.get("registration_enabled", True)
        self._do_update_setting(registration_enabled=new_val)

    @work(thread=True)
    def _do_update_setting(self, **kwargs):
        try:
            api.update_settings(**kwargs)
            self.app.call_from_thread(self.notify, "Settings updated", severity="information")
            self._load_settings()
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    # ── Audit ──
    @work(thread=True)
    def _load_audit(self):
        try:
            data = api.list_audit_logs(page_size=100)
            self.app.call_from_thread(self._populate_audit, data)
        except Exception as e:
            self.app.call_from_thread(self.notify, f"Error: {e}", severity="error")

    def _populate_audit(self, data):
        table = self.query_one("#audit-table", DataTable)
        table.clear()
        for log in data.get("data", []):
            table.add_row(
                log.get("created_at", "")[:19],
                f"{log.get('actor_type', '')}:{log.get('actor_id', '')}",
                log.get("action", ""),
                log.get("resource_type", ""),
                log.get("resource_id", "")[:20],
            )

    @on(Button.Pressed, "#btn-refresh-audit")
    def refresh_audit(self):
        self._load_audit()


class UserActionModal(ModalScreen[dict | None]):
    """Actions for a selected user."""
    BINDINGS = [Binding("escape", "cancel", "Cancel", show=False)]
    DEFAULT_CSS = """
    UserActionModal { align: center middle; }
    UserActionModal > Vertical { width: 50; height: auto; max-height: 24; border: thick $accent; background: $surface; padding: 1 2; }
    UserActionModal Label { width: 100%; margin-bottom: 1; }
    UserActionModal Button { width: 100%; margin-bottom: 0; height: 3; }
    UserActionModal Select { width: 100%; margin-bottom: 1; }
    UserActionModal Input { width: 100%; margin-bottom: 1; }
    """
    def __init__(self, user: dict):
        super().__init__()
        self._user = user

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label(f"User: {self._user['username']} (role: {self._user.get('role', 'viewer')})")
            yield Label("Change Role:")
            yield Select(
                [("admin", "admin"), ("editor", "editor"), ("viewer", "viewer")],
                value=self._user.get("role", "viewer"), id="ua-role",
            )
            yield Button("Apply Role", variant="primary", id="btn-apply-role")
            yield Label("New Password:")
            yield Input(placeholder="new password", password=True, id="ua-pass")
            yield Button("Change Password", variant="warning", id="btn-apply-pass")
            yield Button("Delete User", variant="error", id="btn-delete-user")
            yield Button("Cancel", id="cancel")

    @on(Button.Pressed, "#btn-apply-role")
    def apply_role(self):
        role = self.query_one("#ua-role", Select).value
        self.dismiss({"action": "change_role", "username": self._user["username"], "role": role})

    @on(Button.Pressed, "#btn-apply-pass")
    def apply_password(self):
        pwd = self.query_one("#ua-pass", Input).value
        if not pwd:
            self.notify("Password required", severity="error")
            return
        self.dismiss({"action": "change_password", "username": self._user["username"], "password": pwd})

    @on(Button.Pressed, "#btn-delete-user")
    def delete_user(self):
        self.dismiss({"action": "delete", "username": self._user["username"]})

    @on(Button.Pressed, "#cancel")
    def on_cancel(self):
        self.dismiss(None)

    def action_cancel(self):
        self.dismiss(None)


# ═══════════════════════════════════════════════════════════════════════════════
#  APP
# ═══════════════════════════════════════════════════════════════════════════════

class MdBrowseApp(App):
    TITLE = "md-browse"
    SUB_TITLE = "Markdown Document Manager"
    CSS = """
    #main-layout { layout: horizontal; height: 1fr; }
    """

    def __init__(self):
        super().__init__()
        self.user_info = {}

    def on_mount(self):
        self.install_screen(LoginScreen(), name="login")
        self.install_screen(MainScreen(), name="main")
        self.push_screen("login")
