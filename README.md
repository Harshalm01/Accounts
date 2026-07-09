# Creator Invoice Portal MVP

This is an MVP implementation based on your finalized flow:

- Public creator portal at `/`
- Admin side at `/admin`
- Roles: `SUPER_ADMIN`, `TEAM`, `ACCOUNTS`
- Team creates campaigns with predefined fields: Campaign Name, Campaign Code
- Team maps creators (name + mobile) to campaign with predefined amount per creator
- Creator enters campaign code + mobile, gets campaign name and locked creator amount
- Creator fills remaining invoice fields, adds e-sign (draw or upload), submits
- Invoice PDF is generated and visible in admin dashboard
- Accounts can `Edit Invoice`, and edited PDF regenerates automatically
- Accounts can `Accept` or `Reject`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Run app:

```bash
npm start
```

3. Open:

- Creator portal: http://localhost:3000/
- Admin login: http://localhost:3000/admin

## Default Users

- Super Admin:
  - Username: `superadmin`
  - Password: `Admin@123`
- Accounts:
  - Username: `accounts`
  - Password: `Accounts@123`
- Team:
  - Username: `team1`
  - Password: `Team@123`

## Notes

- This version uses SQLite (`portal.db`) for quick local MVP.
- Passwords are hashed; only reset is allowed from super admin side.
- "To" company block is static and non-editable in generated PDF.
- GST flow is intentionally excluded for now (phase 2).