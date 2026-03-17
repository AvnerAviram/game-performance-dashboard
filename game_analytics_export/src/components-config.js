/**
 * Component Configuration
 * Centralized component class names for consistency across the dashboard
 */

export const COMPONENTS = {
  // Page Containers
  pageContainer: 'page-container',
  pageHeaderSimple: 'page-header-simple',
  pageTitleSimple: 'page-title-simple',
  pageSubtitleSimple: 'page-subtitle-simple',
  
  // Sticky Headers
  stickyHeader: 'sticky-header',
  stickyHeaderContent: 'sticky-header-content',
  stickyHeaderTitle: 'sticky-header-title',
  stickyHeaderSubtitle: 'sticky-header-subtitle',
  
  // Cards
  card: 'card',
  cardHeader: 'card-header',
  
  // Filters & Tabs
  filterTabs: 'filter-tabs',
  filterTab: 'filter-tab',
  anomalyTabs: 'anomaly-tabs',
  anomalyTab: 'anomaly-tab',
  
  // Buttons
  btnPrimary: 'btn-primary',
  btnSecondary: 'btn-secondary',
  
  // Stats & Metrics
  statCard: 'stat-card',
  statLabel: 'stat-label',
  statValue: 'stat-value',
  metricCard: 'metric-card',
  metricLabel: 'metric-label',
  metricValue: 'metric-value',
  metricChange: 'metric-change',
  
  // Panels
  panel: 'panel',
  panelHeader: 'panel-header',
  panelTitle: 'panel-title',
  panelBody: 'panel-body',
  
  // Tables
  tableContainer: 'table-container',
  dataTable: 'data-table',
  
  // Badges
  badge: 'badge',
  badgeBlue: 'badge-blue',
  badgeGreen: 'badge-green',
  badgeYellow: 'badge-yellow',
  badgeRed: 'badge-red',
  badgeGray: 'badge-gray',
  
  // Theme Chips
  themeChip: 'theme-chip',
  
  // Sidebar
  sidebar: 'sidebar',
  navItem: 'nav-item',
  
  // Loading & Empty States
  loadingSpinner: 'loading-spinner',
  emptyState: 'empty-state',
  
  // Charts
  chartContainer: 'chart-container',
  chartTitle: 'chart-title'
};

/**
 * Page Patterns
 * Pre-configured component combinations for common page layouts
 */
export const PATTERNS = {
  // Simple page without sticky header
  simplePage: {
    container: COMPONENTS.pageContainer,
    header: COMPONENTS.pageHeaderSimple,
    title: COMPONENTS.pageTitleSimple,
    subtitle: COMPONENTS.pageSubtitleSimple
  },
  
  // Sticky header page with filters/tabs
  stickyPage: {
    container: COMPONENTS.pageContainer,
    header: COMPONENTS.stickyHeader,
    headerContent: COMPONENTS.stickyHeaderContent,
    title: COMPONENTS.stickyHeaderTitle,
    subtitle: COMPONENTS.stickyHeaderSubtitle
  }
};

/**
 * Page Type Mapping
 * Maps each page ID to its recommended pattern
 */
export const PAGE_PATTERNS = {
  'overview': 'simplePage',
  'themes': 'stickyPage',
  'mechanics': 'stickyPage',
  'games': 'stickyPage',
  'providers': 'stickyPage',
  'anomalies': 'simplePage',
  'insights': 'simplePage',
  'trends': 'simplePage',
  'prediction': 'simplePage',
  'ai-assistant': 'simplePage'
};
