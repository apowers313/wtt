#!/bin/bash
# This script creates a wrapper for git that forces --no-gpg-sign
# Use this if you're still getting signing prompts in tests

cat > /tmp/git-test-wrapper << 'EOF'
#!/bin/bash
# Git wrapper that disables signing

# Check if this is a commit or tag command
if [[ "$1" == "commit" ]] || [[ "$1" == "tag" && "$2" == "-a" ]]; then
    # Insert --no-gpg-sign after the command
    exec /usr/bin/git "$1" --no-gpg-sign "${@:2}"
else
    # Pass through for other commands
    exec /usr/bin/git "$@"
fi
EOF

chmod +x /tmp/git-test-wrapper

echo "Git wrapper created at: /tmp/git-test-wrapper"
echo "To use in tests, set: PATH=/tmp:\$PATH"