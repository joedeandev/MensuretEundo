#!/bin/sh
apk update
apk add --no-cache python3 make g++
# sqlite3 can't install without 'python' pointing to 'python3'
ln -sf python3 /usr/bin/python
