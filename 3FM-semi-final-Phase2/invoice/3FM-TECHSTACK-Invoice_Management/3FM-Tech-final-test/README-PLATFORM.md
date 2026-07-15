# 3 Folks Media - Influencer Management Platform

A modern full-stack influencer management system with React frontend and Django REST API backend.

## 🚀 Features

### ✨ Frontend (React + Vite)

- **Dashboard**: Real-time statistics and visualizations
  - Total influencers count
  - Average followers metrics
  - Cities covered
  - Complete profiles count
  - Interactive charts (Pie charts, Bar charts)
  - Tier distribution visualization
  - Gender distribution
  - Top locations and genres

- **Influencers List**: Advanced search and filtering
  - Search by name, email, location, genre
  - Filter by follower tier (Nano, Micro, Mid-tier, Macro, Mega)
  - Filter by gender, location
  - Filter by follower range (min/max)
  - Card-based grid layout
  - Contact information quick access
  - Instagram profile links

- **Influencer Profiles**: Detailed individual views
  - Complete influencer information
  - Statistics and metrics
  - Contact information
  - Brand collaboration history
  - Metadata and timestamps

- **Campaign Management**: Track brand collaborations
  - Campaign list view
  - Status tracking (Active, Pending, Completed, Cancelled)
  - Compensation details
  - Timeline management
  - CRUD operations for campaigns

### 🔧 Backend (Django REST Framework)

- **REST API Endpoints**:
  - `/api/influencers/` - List andcreate influencers
  - `/api/influencers/:id/` - Retrieve, update, delete influencer
  - `/api/influencers/stats/` - Dashboard statistics
  - `/api/campaigns/` - Manage brand collaborations
  - `/api/import-logs/` - View import history

- **Features**:
  - Full CRUD operations
  - Advanced filtering and search
  - Pagination (50 items per page)
  - CORS enabled for frontend
  - Optimized database queries

## 📦 Tech Stack

### Frontend
- **React 18** - UI library
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **Tailwind CSS** - Styling
- **Recharts** - Data visualization
- **Lucide React** - Icon library
- **Axios** - HTTP client

### Backend
- **Django 6.0** - Web framework
- **Django REST Framework** - API
- **SQLite** - Database
- **django-filter** - Advanced filtering
- **django-cors-headers** - CORS support

## 🛠️ Installation & Setup

### Backend Setup

1. Navigate to the backend directory:
```bash
cd "c:\3 Folks Media\backend"
```

2. Install dependencies (already done):
```bash
pip install django djangorestframework django-cors-headers django-filter pandas
```

3. Run migrations (if needed):
```bash
python manage.py migrate
```

4. Start Django development server:
```bash
python manage.py runserver
```

Backend will run at: **http://127.0.0.1:8000/**

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd "c:\3 Folks Media\frontend"
```

2. Install dependencies (already done):
```bash
npm install
```

3. Start Vite development server:
```bash
npm run dev
```

Frontend will run at: **http://localhost:5173/**

## 🎯 Usage Guide

### Access Points

- **React UI**: http://localhost:5173/
- **Django Admin**: http://127.0.0.1:8000/admin/
- **API Root**: http://127.0.0.1:8000/api/
- **API Docs**: http://127.0.0.1:8000/api/ (browsable API)

### Current Data

You currently have **50 test influencers** in the database imported from your testing CSV.

### Navigation

1. **Dashboard** (`/dashboard`)
   - View overall statistics
   - Analyze tier distribution
   - See gender breakdown
   - Check top locations and genres

2. **Influencers** (`/influencers`)
   - Browse all influencers
   - Use search bar for quick lookup
   - Apply filters (tier, gender, location, followers)
   - Click "View Profile" for details

3. **Influencer Profile** (`/influencers/:id`)
   - View complete influencer information
   - Access contact details
   - See collaboration history
   - Check Record metadata

4. **Campaigns** (`/campaigns`)
   - View all brand collaborations
   - Track campaign status
   - Manage compensation details
   - Timeline overview

## 🔄 API Examples

### Get All Influencers
```
GET http://127.0.0.1:8000/api/influencers/
```

### Filter by Tier
```
GET http://127.0.0.1:8000/api/influencers/?tier=micro
```

### Search Influencers
```
GET http://127.0.0.1:8000/api/influencers/?search=Mumbai
```

### Get Dashboard Stats
```
GET http://127.0.0.1:8000/api/influencers/stats/
```

### Get Single Influencer
```
GET http://127.0.0.1:8000/api/influencers/1/
```

### Get Campaigns
```
GET http://127.0.0.1:8000/api/campaigns/
```

## 📊 Follower Tiers

- **Nano**: 1 - 10,000 followers
- **Micro**: 10,000 - 100,000 followers
- **Mid-tier**: 100,000 - 1,000,000 followers
- **Macro**: 1,000,000 - 10,000,000 followers
- **Mega**: 10,000,000+ followers

## 🎨 UI Features

- **Responsive Design**: Works on all screen sizes
- **Modern UI**: Clean, professional interface
- **Fast Navigation**: Client-side routing
- **Real-time Updates**: Automatic data refresh
- **Interactive Charts**: Recharts visualizations
- **Icon System**: Lucide React icons
- **Color Coded**: Tier-based color system

## 🚦 Current Status

✅ React frontend fully set up with Vite
✅ Django REST API endpoints created
✅ Dashboard with statistics and charts
✅ Search & Filter functionality
✅ Influencer profile pages
✅ Campaign management interface
✅ Both servers running
✅ 50 test influencers imported

## 📝 Next Steps

1. Open your browser and go to http://localhost:5173/
2. Explore the dashboard
3. Search and filter influencers
4. View influencer profiles
5. Check the campaign management page

## 🔧 Development Commands

### Backend
```bash
cd "c:\3 Folks Media\backend"

# Run server
python manage.py runserver

# Import test data
python manage.py import_test_csv --clear

# Access Django shell
python manage.py shell
```

### Frontend
```bash
cd "c:\3 Folks Media\frontend"

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📂 Project Structure

```
3 Folks Media/
├── backend/
│   ├── config/              # Django settings
│   ├── influencers/         # Main app
│   │   ├── models.py       # Database models
│   │   ├── serializers.py  # API serializers
│   │   ├── views.py        # API views
│   │   ├── urls.py         # API routes
│   │   └── admin.py        # Admin interface
│   └── db.sqlite3          # Database (50 influencers)
│
└── frontend/
    ├── src/
    │   ├── components/     # Reusable components
    │   │   └── Layout.jsx # Main layout with sidebar
    │   ├── pages/          # Page components
    │   │   ├── Dashboard.jsx
    │   │   ├── InfluencersList.jsx
    │   │   ├── InfluencerProfile.jsx
    │   │   └── CampaignManagement.jsx
    │   ├── services/       # API client
    │   │   └── api.js     # Axios configuration
    │   ├── App.jsx        # Main app component
    │   └── main.jsx       # Entry point
    └── package.json        # Dependencies
```

## 🎉 You're All Set!

Both servers are running:
- Backend: **http://127.0.0.1:8000/**
- Frontend: **http://localhost:5173/**

Open http://localhost:5173/ in your browser to start using the platform!
