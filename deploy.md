# Deployment

本文档记录服务器上通过 PM2 启动、重启 `genre-lab` 的常用命令，尤其适用于 CentOS/RHEL 等系统库较老、直接运行新版 Node 会报 `GLIBC` / `GLIBCXX` / `CXXABI` 缺失的机器。

## 1. 进入项目目录

示例路径：

```bash
cd /root/genre-lab
```

如果你的项目在其他目录，替换成实际路径即可。

## 2. 拉取最新代码

```bash
git pull
```

如果拉取后依赖、模型或本地运行时可能变化，先执行项目安装脚本：

```bash
bash scripts/setup_server.sh
```

这个脚本会安装或校验：

```text
Node.js >= 18
Python 3.10
.venv-essentia
essentia-tensorflow
yt-dlp
ffmpeg / ffprobe
Essentia 模型文件
Discogs400 taxonomy
```

在 glibc 较老的服务器上，脚本会自动下载可用的项目本地 Node，并在 `bin/` 目录下生成 `node`、`npm`、`npx` 链接。

## 3. 使用项目本地 Node

每次手动部署时，建议先让当前 shell 优先使用项目里的 Node：

```bash
export PATH="$PWD/bin:$PATH"
node -v
npm -v
```

如果 `node -v` 能正常输出版本号，说明当前 shell 已经避开了系统里不可用的 Node。

## 4. 首次用 PM2 启动

仅本机访问：

```bash
pm2 start server.js --name genre-lab --interpreter "$PWD/bin/node"
pm2 save
pm2 logs genre-lab
```

允许服务器外部访问：

```bash
HOST=0.0.0.0 PORT=4173 pm2 start server.js --name genre-lab --interpreter "$PWD/bin/node"
pm2 save
pm2 logs genre-lab
```

服务默认端口是 `4173`。

## 5. 重新拉代码后的重启

```bash
cd /root/genre-lab
git pull
bash scripts/setup_server.sh
export PATH="$PWD/bin:$PATH"
pm2 restart genre-lab --update-env
pm2 logs genre-lab
```

如果之前启动时没有指定 `--interpreter "$PWD/bin/node"`，建议删除旧进程后重新创建：

```bash
pm2 delete genre-lab 2>/dev/null || true
pm2 start server.js --name genre-lab --interpreter "$PWD/bin/node"
pm2 save
pm2 logs genre-lab
```

外部访问版本：

```bash
pm2 delete genre-lab 2>/dev/null || true
HOST=0.0.0.0 PORT=4173 pm2 start server.js --name genre-lab --interpreter "$PWD/bin/node"
pm2 save
pm2 logs genre-lab
```

## 6. 如果 PM2 本身也报 GLIBC 错误

如果运行 `pm2 start ...` 时出现类似错误：

```text
node: /lib64/libstdc++.so.6: version `CXXABI_1.3.11' not found
node: /lib64/libc.so.6: version `GLIBC_2.28' not found
```

说明当前 `pm2` 使用的是系统里不可用的 Node。先切到项目本地 Node，再重新安装 PM2：

```bash
cd /root/genre-lab
bash scripts/setup_server.sh
export PATH="$PWD/bin:$PATH"
npm install -g pm2
```

然后用新安装的 PM2 启动：

```bash
"$(npm prefix -g)/bin/pm2" delete genre-lab 2>/dev/null || true
"$(npm prefix -g)/bin/pm2" start server.js --name genre-lab --interpreter "$PWD/bin/node"
"$(npm prefix -g)/bin/pm2" save
"$(npm prefix -g)/bin/pm2" logs genre-lab
```

外部访问版本：

```bash
"$(npm prefix -g)/bin/pm2" delete genre-lab 2>/dev/null || true
HOST=0.0.0.0 PORT=4173 "$(npm prefix -g)/bin/pm2" start server.js --name genre-lab --interpreter "$PWD/bin/node"
"$(npm prefix -g)/bin/pm2" save
"$(npm prefix -g)/bin/pm2" logs genre-lab
```

## 7. 常用排查命令

查看 PM2 进程：

```bash
pm2 list
```

查看日志：

```bash
pm2 logs genre-lab
```

查看项目本地 Node：

```bash
export PATH="$PWD/bin:$PATH"
which node
node -v
```

检查服务是否监听：

```bash
curl -I http://127.0.0.1:4173
```

如果服务绑定了 `HOST=0.0.0.0`，还需要确认云服务器安全组和系统防火墙已放行 `4173` 端口。

