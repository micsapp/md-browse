"""HTTP API client for md-browse backend."""
import requests
import os
import tempfile
import subprocess
import shlex


class APIError(Exception):
    def __init__(self, status, code, message, hint=None):
        self.status = status
        self.code = code
        self.hint = hint
        super().__init__(message)


class MdBrowseAPI:
    def __init__(self, base_url=None):
        self.base_url = (base_url or os.environ.get("MD_BROWSE_URL", "http://localhost:3001")).rstrip("/")
        self.token = None

    def _headers(self):
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _request(self, method, path, **kwargs):
        url = f"{self.base_url}{path}"
        headers = kwargs.pop("headers", self._headers())
        resp = requests.request(method, url, headers=headers, timeout=15, **kwargs)
        if resp.status_code == 204:
            return None
        data = resp.json() if resp.content else {}
        if resp.status_code >= 400:
            err = data.get("error", {})
            raise APIError(resp.status_code, err.get("code", "error"), err.get("message", resp.text), err.get("hint"))
        return data

    # --- Auth ---
    def login(self, username, password):
        data = self._request("POST", "/api/auth/login", json={"username": username, "password": password})
        self.token = data["token"]
        return data

    def me(self):
        return self._request("GET", "/api/auth/me")

    # --- Documents ---
    def list_documents(self, page=1, page_size=50, q=None, tag=None, folder_id=None, sort_by="updated_at", sort_order="desc"):
        params = {"page": page, "page_size": page_size, "sort_by": sort_by, "sort_order": sort_order}
        if q:
            params["q"] = q
        if tag:
            params["tag"] = tag
        if folder_id is not None:
            params["folder_id"] = folder_id
        return self._request("GET", "/api/v1/documents", params=params)

    def get_document(self, doc_id, include_raw=True, include_rendered=True):
        params = {"include_raw": str(include_raw).lower(), "include_rendered": str(include_rendered).lower()}
        return self._request("GET", f"/api/v1/documents/{doc_id}", params=params)

    def upload_document(self, file_path, category=None, tags=None, folder_id=None, visibility="team"):
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        data = {}
        if category:
            data["category"] = category
        if tags:
            data["tags"] = ",".join(tags) if isinstance(tags, list) else tags
        if folder_id:
            data["folder_id"] = folder_id
        if visibility:
            data["visibility"] = visibility
        with open(file_path, "rb") as f:
            resp = requests.post(
                f"{self.base_url}/api/v1/documents/upload",
                headers=headers, data=data,
                files={"file": (os.path.basename(file_path), f, "text/markdown")},
                timeout=30,
            )
        if resp.status_code >= 400:
            err = resp.json().get("error", {})
            raise APIError(resp.status_code, err.get("code"), err.get("message"), err.get("hint"))
        return resp.json()

    def update_document(self, doc_id, **kwargs):
        return self._request("PUT", f"/api/v1/documents/{doc_id}", json=kwargs)

    def delete_document(self, doc_id):
        self._request("DELETE", f"/api/v1/documents/{doc_id}")

    # --- Versions ---
    def list_versions(self, doc_id):
        return self._request("GET", f"/api/v1/documents/{doc_id}/versions")

    def rollback(self, doc_id, target_version, change_note=""):
        return self._request("POST", f"/api/v1/documents/{doc_id}/rollback",
                             json={"target_version": target_version, "change_note": change_note})

    # --- Search ---
    def search(self, query, page=1, page_size=50):
        return self._request("GET", "/api/v1/search", params={"q": query, "page": page, "page_size": page_size})

    # --- Folders ---
    def list_folders(self):
        return self._request("GET", "/api/v1/folders")

    def create_folder(self, name, parent_id=None):
        body = {"name": name}
        if parent_id:
            body["parent_id"] = parent_id
        return self._request("POST", "/api/v1/folders", json=body)

    def update_folder(self, folder_id, name=None, parent_id=None):
        body = {}
        if name is not None:
            body["name"] = name
        if parent_id is not None:
            body["parent_id"] = parent_id
        return self._request("PUT", f"/api/v1/folders/{folder_id}", json=body)

    def delete_folder(self, folder_id):
        self._request("DELETE", f"/api/v1/folders/{folder_id}")

    # --- Admin: Users ---
    def list_users(self):
        return self._request("GET", "/api/v1/admin/users")

    def create_user(self, username, password, role="viewer"):
        return self._request("POST", "/api/v1/admin/users", json={"username": username, "password": password, "role": role})

    def update_user(self, username, role=None, password=None):
        body = {}
        if role is not None:
            body["role"] = role
        if password is not None:
            body["password"] = password
        return self._request("PUT", f"/api/v1/admin/users/{username}", json=body)

    def delete_user(self, username):
        self._request("DELETE", f"/api/v1/admin/users/{username}")

    # --- Admin: Settings ---
    def get_settings(self):
        return self._request("GET", "/api/v1/admin/settings")

    def update_settings(self, **kwargs):
        return self._request("PUT", "/api/v1/admin/settings", json=kwargs)

    # --- Audit ---
    def list_audit_logs(self, page=1, page_size=50, actor_type=None, action=None):
        params = {"page": page, "page_size": page_size}
        if actor_type:
            params["actor_type"] = actor_type
        if action:
            params["action"] = action
        return self._request("GET", "/api/v1/audit-logs", params=params)

    # --- Categories / Tags ---
    def list_categories(self):
        return self._request("GET", "/api/v1/categories")

    def list_tags(self):
        return self._request("GET", "/api/v1/tags")


# --- SSH Helpers ---
def ssh_list_dir(host, remote_path, user=None):
    target = f"{user}@{host}" if user else host
    cmd = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
           "-o", "ConnectTimeout=5", target, f"ls -la {shlex.quote(remote_path)}"]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "SSH connection failed")
    entries = []
    for line in result.stdout.strip().split("\n")[1:]:
        parts = line.split(None, 8)
        if len(parts) >= 9:
            perms, _, _, _, size, _m1, _m2, _m3, name = parts
            if name in (".", ".."):
                continue
            entries.append({"name": name, "is_dir": perms.startswith("d"), "size": size, "perms": perms})
    return entries


def ssh_download(host, remote_path, user=None):
    target = f"{user}@{host}:{remote_path}" if user else f"{host}:{remote_path}"
    tmp = tempfile.mktemp(suffix=".md")
    cmd = ["scp", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
           "-o", "ConnectTimeout=5", target, tmp]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "SCP download failed")
    return tmp
