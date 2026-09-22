import os
import sys

# Change working directory to script location
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Delegate to desktop_app.py
import desktop_app
desktop_app.main()
