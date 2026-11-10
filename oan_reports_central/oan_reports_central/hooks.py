app_name = "oan_reports_central"
app_title = "OAN Reports Central"
app_publisher = "Centre for Open Societal Systems"
app_description = "OpenAgriNet Report Center"
app_email = "dev@openagrinet.org"
app_license = "mit"
app_version = "0.0.1"

# Website / SPA
website_route_rules = [
    {"from_route": "/report-center/<path:app_path>", "to_route": "report_center"},
    {"from_route": "/report-center", "to_route": "report_center"},
]

# Includes in <head> for desk (none for SPA-first)
app_include_css = []
app_include_js = []

# Permissions / fixtures reserved for later DocTypes
fixtures = []

# Scheduled jobs placeholder for report schedules
scheduler_events = {}
