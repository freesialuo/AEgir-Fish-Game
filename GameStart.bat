@echo off
echo 正在启动服务器...
start http://localhost:8000/index.html
python -m http.server 8000