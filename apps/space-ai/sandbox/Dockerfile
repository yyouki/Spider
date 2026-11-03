# Use a pinned public Node.js image on Debian Trixie.
FROM node:24.20.0-trixie-slim

USER root

# Python is installed at image-build time; the running sandbox has no internet access.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# The container stays available for short, supervised task processes.
CMD ["sleep", "infinity"]
