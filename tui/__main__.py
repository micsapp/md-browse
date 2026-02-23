"""md-browse TUI – run with: python3 -m tui"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from tui.app import MdBrowseApp

if __name__ == "__main__":
    app = MdBrowseApp()
    app.run()
