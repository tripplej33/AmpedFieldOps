# AmpedFieldOps - Electrical Contracting Service Management Platform

## Implementation Summary

A comprehensive, mobile-first service business management platform designed for electrical contractors featuring real-time project tracking, timesheet management, and Xero integration.

## Technical Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom Technical Command Center theme
- **UI Components**: Shadcn/ui (Radix UI primitives)
- **Routing**: React Router v6
- **Icons**: Lucide React
- **Typography**: Space Grotesk (headings), JetBrains Mono (data), Inter (body)

## Design System

### Color Palette
- **Background**: Deep charcoal (#1a1d23)
- **Card**: Warm off-black (#2a2d35)
- **Primary (Electric)**: #00d4ff
- **Secondary (Warning)**: #ffd60a
- **Success (Voltage)**: #39ff14
- **Text**: Cool white (#e8eaed) / Muted slate (#9ca3af)

### Visual Features
- Subtle grain texture background
- Glow effects on interactive elements
- Custom animations (button-press, slide-up-fade, elastic-bounce, screen-shake, rotate)
- Progress rings and bars with color-coded budget health
- Monospaced typography for data and metrics

## Features Implemented

### 1. Dashboard (Command Center)
- Real-time metrics with trend indicators
- 4-card metric overview (Active Projects, Total Hours, Revenue, Team Active)
- Weekly hours sparkline chart
- Quick stats with progress bars
- Recent timesheet entries feed
- Active projects list with budget tracking

### 2. Project Management
- Kanban board with 4 status columns (Quoted, In Progress, Completed, Invoiced)
- Project cards with:
  - Circular progress rings
  - Budget vs actual tracking
  - Cost center badges
  - Quick actions dropdown
- Project detail modal with:
  - Budget overview
  - Tabbed interface (Cost Breakdown, Timesheets, Details)
  - Send to Xero functionality with loading animation
  - Real-time sync status

### 3. Client Directory
- Grid layout with client cards
- Inline search and filtering
- Client metrics (Active Projects, Total Hours, Last Contact)
- Quick action buttons (View Details, New Project)
- Status badges
- Contact information display

### 4. Timesheet Management
- Weekly calendar view with date cells
- Daily hour totals
- Activity type icons and color coding (Installation, Repair, Maintenance, Inspection, Consultation)
- Timeline grouped by date
- Inline edit and delete actions
- Cost center tracking
- Photo attachment support

### 5. Reports & Analytics
- Summary metrics cards
- Cost center matrix table with:
  - Hierarchical data grouping
  - Real-time hour totals
  - Budget burn indicators
  - Utilization progress bars
- Budget burn rate visualization
- Export options (CSV)

### 6. Settings
- Xero integration configuration
  - Connection status indicator
  - Manual sync trigger
  - Auto-sync toggle
- Notification preferences
- Cost center management
- System information display

### 7. Mobile Features
- Floating Action Button (FAB) for quick timesheet entry
- Mobile timesheet modal with:
  - Photo capture button
  - Client/project selection
  - Activity type grid selector
  - Hours input with numeric keyboard
  - Notes textarea
  - Smart form validation
- Responsive sidebar with mobile menu
- Touch-optimized UI elements
- Mobile-first header with adaptive search

## Component Architecture

```
src/
├── components/
│   ├── layout/
│   │   ├── DashboardLayout.tsx
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   ├── modals/
│   │   ├── MobileTimesheetModal.tsx
│   │   └── ProjectDetailModal.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Projects.tsx
│   │   ├── Clients.tsx
│   │   ├── Timesheets.tsx
│   │   ├── Reports.tsx
│   │   └── Settings.tsx
│   └── ui/
│       ├── FloatingActionButton.tsx
│       └── [shadcn components]
├── lib/
│   ├── mockData.ts
│   └── utils.ts
└── types/
    └── index.ts
```

## Key Interactions

### Rapid Timesheet Entry
1. Tap FAB → Modal opens
2. Auto-populate date/time
3. Select client from dropdown
4. Select project (filtered by client)
5. Choose activity type from visual grid
6. Enter hours
7. Add notes (optional)
8. Submit with validation

### Project Status Management
1. View Kanban board by status
2. Click project card → Detail modal
3. Review budget metrics and progress
4. View cost breakdown by center
5. Send to Xero with animated sync

### Client Management
1. Search and filter clients
2. View client cards with metrics
3. Quick actions for projects
4. Contact information access

## Responsive Design

- **Mobile (< 768px)**: 
  - Collapsible sidebar with overlay
  - Stacked layouts
  - Hidden search in header
  - Bottom-positioned FAB
  - Full-screen modals

- **Tablet (768px - 1024px)**:
  - 2-column grids
  - Compact navigation
  - Visible search

- **Desktop (> 1024px)**:
  - Persistent sidebar
  - 3-4 column grids
  - Max-width content (1400px)
  - Full feature visibility

## Future Enhancements

- Real backend integration (currently uses mock data)
- Actual Xero API integration
- Camera API for photo capture
- Offline mode with local storage
- Real-time WebSocket updates
- Advanced filtering and sorting
- PDF report generation
- Team member management
- Project file attachments
- Cost center budgeting
- Invoice generation
- Time tracking timer
- Push notifications
- Multi-language support

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Type check
npx tsc --noEmit
```

## Notes

- All data is currently mocked in `src/lib/mockData.ts`
- Color system uses CSS custom properties for easy theming
- Custom animations defined in `src/index.css`
- Path alias `@/` configured for clean imports
- Mobile-first responsive design throughout
- Follows PRD specifications for Technical Command Center aesthetic
