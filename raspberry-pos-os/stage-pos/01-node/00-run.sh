#!/bin/bash -e

# Node.js 22 LTS from NodeSource (arm64).
on_chroot << EOF
if ! command -v node >/dev/null 2>&1 || [ "\$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 22 ]; then
	curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
	apt-get install -y nodejs
fi
node -v
npm -v
EOF
