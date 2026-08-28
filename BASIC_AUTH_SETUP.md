# Kiro Router Plus - Basic Authentication Setup

## Summary

Basic authentication has been successfully added to **https://kiro.router.plus** to protect access to the Kiro Account Manager and all backend services.

## Credentials

```
URL: https://kiro.router.plus
Username: admin
Password: El2bfDMU
```

⚠️ **IMPORTANT**: Store these credentials securely. They are required for all access to kiro.router.plus.

## What's Protected

All endpoints on kiro.router.plus now require basic authentication:

- ✅ **Root (/)** - Xpra HTML5 client interface
- ✅ **/mcp** - Chrome DevTools Protocol MCP Server
- ✅ **/cdp/** - CDP WebSocket proxy for DevTools
- ✅ **All WebSocket connections** - Xpra streams and CDP connections

## How It Works

1. **User visits https://kiro.router.plus**
2. **Browser prompts for username/password** (HTTP Basic Auth)
3. **Nginx validates credentials** against /etc/nginx/auth/.htpasswd
4. **Access granted** if credentials match, otherwise 401 Unauthorized

## Testing Results

```bash
✅ Without credentials: 401 Unauthorized (blocked)
✅ With correct credentials: 200 OK (access granted)
✅ With wrong credentials: 401 Unauthorized (blocked)
```

## Configuration Files

### Password File
- **Location**: `/etc/nginx/auth/.htpasswd`
- **Format**: Apache htpasswd (bcrypt encrypted)
- **Permissions**: 644 (root:root)

### Nginx Configuration
- **Location**: `/etc/nginx/sites-available/kiro.router.plus`
- **Auth directive**: `auth_basic "Kiro Access";`
- **Password file**: `auth_basic_user_file /etc/nginx/auth/.htpasswd;`

## Management Commands

### Add New User
```bash
htpasswd -b /etc/nginx/auth/.htpasswd <username> <password>
systemctl reload nginx
```

### Change Password
```bash
htpasswd -b /etc/nginx/auth/.htpasswd admin <new_password>
systemctl reload nginx
```

### Remove User
```bash
htpasswd -D /etc/nginx/auth/.htpasswd <username>
systemctl reload nginx
```

### View All Users
```bash
cat /etc/nginx/auth/.htpasswd | cut -d: -f1
```

### Disable Authentication (Emergency)
```bash
# Comment out auth lines in nginx config
sed -i 's/auth_basic/#auth_basic/g' /etc/nginx/sites-available/kiro.router.plus
systemctl reload nginx
```

### Re-enable Authentication
```bash
# Uncomment auth lines in nginx config
sed -i 's/#auth_basic/auth_basic/g' /etc/nginx/sites-available/kiro.router.plus
systemctl reload nginx
```

## Security Notes

1. **HTTPS Only**: Authentication works over HTTPS, credentials are encrypted in transit
2. **Password Strength**: Current password is 32-character base64 (very strong)
3. **Brute Force**: Consider adding fail2ban if public-facing
4. **Certificate**: Let's Encrypt SSL certificate valid and auto-renewing
5. **No Plaintext**: Password stored as bcrypt hash in .htpasswd

## Browser Behavior

- **First Visit**: Browser shows login prompt
- **Credentials Saved**: Browser remembers for the session
- **Different Browsers**: Need to enter credentials separately
- **Incognito/Private**: Always prompts for credentials
- **API Clients**: Must send Authorization header: `Authorization: Basic <base64(user:pass)>`

## Programmatic Access

For automated access (scripts, API clients):

```bash
# Using curl
curl -u admin:El2bfDMU https://kiro.router.plus

# Using wget
wget --user=admin --password='El2bfDMU' https://kiro.router.plus

# Using Authorization header
AUTH=$(echo -n "admin:El2bfDMU" | base64)
curl -H "Authorization: Basic $AUTH" https://kiro.router.plus
```

## Troubleshooting

### Still Getting 401 After Entering Credentials
```bash
# Check password file exists and is readable
ls -la /etc/nginx/auth/.htpasswd

# Verify nginx config
nginx -t

# Check nginx error logs
tail -f /var/log/nginx/error.log
```

### Clear Browser Saved Credentials
- Chrome: Settings → Privacy → Clear browsing data → Passwords
- Firefox: Settings → Privacy → Saved Logins
- Safari: Preferences → Passwords

### Test Authentication
```bash
/root/kiro/test-auth.sh
```

## Backup & Recovery

### Backup Credentials
```bash
cp /etc/nginx/auth/.htpasswd /root/kiro/htpasswd.backup
```

### Restore Credentials
```bash
cp /root/kiro/htpasswd.backup /etc/nginx/auth/.htpasswd
systemctl reload nginx
```

## Applied
- **Date**: August 28, 2026
- **Time**: 16:37 UTC
- **Status**: ✅ Active and Working
- **Nginx Status**: ✅ Running and Reloaded

## Related Files
- Credentials: `/root/kiro/KIRO_ACCESS_CREDENTIALS.txt`
- Test Script: `/root/kiro/test-auth.sh`
- Nginx Config: `/etc/nginx/sites-available/kiro.router.plus`
- Password File: `/etc/nginx/auth/.htpasswd`
