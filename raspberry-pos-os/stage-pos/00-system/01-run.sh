#!/bin/bash -e

# Service + kiosk users, appliance dirs, hardware watchdog.
on_chroot << EOF
if ! id posbridge >/dev/null 2>&1; then
	useradd --system --home-dir /var/lib/pi-bridge --create-home \
		--shell /usr/sbin/nologin posbridge
fi
if ! id kiosk >/dev/null 2>&1; then
	useradd --create-home --shell /usr/sbin/nologin kiosk
fi
usermod -aG video,render,input,tty kiosk

# /data is the appliance data root (pi-bridge SQLite outbox + PGlite cache
# are hardcoded to /data/* in the app config defaults).
mkdir -p /data /etc/pi-bridge/tls /etc/pos /var/lib/pos
chown -R posbridge:posbridge /data
chmod 750 /data
chown root:posbridge /etc/pi-bridge /etc/pi-bridge/tls
chmod 750 /etc/pi-bridge /etc/pi-bridge/tls
chmod 700 /var/lib/pos

# Keep avahi's compat runtime even if dev headers get cleaned up later.
apt-mark manual libavahi-compat-libdnssd1 >/dev/null
EOF

# Hardware watchdog (bcm2835_wdt): reboot if the system locks up.
install -d "${ROOTFS_DIR}/etc/systemd/system.conf.d"
install -m 644 files/10-watchdog.conf "${ROOTFS_DIR}/etc/systemd/system.conf.d/10-watchdog.conf"
