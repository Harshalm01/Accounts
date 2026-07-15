# 3FM PostgreSQL Configuration Guide
# For users who need to set up or troubleshoot PostgreSQL

## Quick Start - PostgreSQL Password Issues

If you get an authentication error like:
```
Error: P1000: Authentication failed against database server at `localhost`, 
the provided database credentials for `postgres` are not valid.
```

### Solution Steps:

#### Step 1: Find Your PostgreSQL Password
The password was set during PostgreSQL installation. Common default values:
- `postgres` (most common)
- `password`
- Empty/No password  
- Your Windows username
- Custom password you set

#### Step 2: Update backend/.env
Edit `backend/.env` with your password:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/3fm_db?schema=public"
```

Replace `YOUR_PASSWORD` with the actual password.

#### Step 3: Test Connection
Run this command to test (or use the setup-database.ps1 script):

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
psql -U postgres -h localhost -c "SELECT version();"
```

When prompted for password, enter your PostgreSQL password.

---

## Alternative: Reset PostgreSQL Password

If you forgot the password, you can reset it:

1. **Stop PostgreSQL Service:**
   ```powershell
   Stop-Service -Name postgresql-x64-18 -Force
   ```

2. **Run PostgreSQL in Single-User Mode:**
   Open Command Prompt as Administrator:
   ```cmd
   "C:\Program Files\PostgreSQL\18\bin\postgres.exe" -D "C:\Program Files\PostgreSQL\18\data" -c shared_preload_libraries="" -c single -u postgres
   ```

3. **Connect and Reset Password:**
   In another Command Prompt as Administrator:
   ```cmd
   "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres
   ```
   Then run:
   ```sql
   ALTER USER postgres WITH PASSWORD 'newpassword';
   \q
   ```

4. **Restart PostgreSQL:**
   ```powershell
   Start-Service postgresql-x64-18
   ```

---

## Verify PostgreSQL Installation

### Check PostgreSQL Service Status
```powershell
Get-Service | Where-Object {$_.Name -like "*postgres*"}
```

Should show:
```
Status   Name
------   ----
Running  postgresql-x64-18
```

### Check PostgreSQL Version
```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" --version
```

### List Databases
```powershell
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
psql -U postgres -h localhost -l
```

---

## Next Steps After Password is Configured

1. **Verify backend/.env**
   ```
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/3fm_db?schema=public"
   ```

2. **Generate Prisma Client**
   ```powershell
   cd backend
   npm run prisma:generate
   ```

3. **Run Migrations**
   ```powershell
   npm run prisma:migrate
   ```
   When prompted, enter a migration name like `init`

4. **Verify Database Created**
   ```powershell
   $env:Path += ";C:\Program Files\PostgreSQL\18\bin"
   psql -U postgres -d 3fm_db -h localhost -c "\dt"
   ```
   Should show all 11 tables

---

## Full PostgreSQL Commands Reference

| Command | Purpose |
|---------|---------|
| `Start-Service postgresql-x64-18` | Start PostgreSQL service |
| `Stop-Service postgresql-x64-18` | Stop PostgreSQL service |
| `Restart-Service postgresql-x64-18` | Restart PostgreSQL service |
| `Get-Service postgresql-x64-18` | Check service status |
| `psql -U postgres -h localhost -l` | List all databases |
| `psql -U postgres -d 3fm_db -h localhost -c "\dt"` | List tables in 3fm_db |
| `psql -U postgres -d 3fm_db -h localhost` | Connect to 3fm_db |

---

For detailed database setup information, see: `DATABASE_SETUP.md`
