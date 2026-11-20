DBOT Business Plan Entry – Frontend Prototype

FILES
- index.html (entry point)
- styles.css
- app.js

RENDER DEPLOYMENT
1. Extract the ZIP.
2. Create a Render Static Site.
3. Upload/connect the folder containing index.html, styles.css and app.js.
4. Build command: leave blank.
5. Publish directory: . (the folder containing index.html).
6. Deploy. Open the generated Render URL.

FEATURES
- Project inputs: start/end date, carpet area, saleable area, built-up area, plot area, sales units and average unit area.
- Duration and monthly columns generated from the date range. Supports up to 120 months; horizontal scrolling handles long ranges such as 48 months.
- MSP slabs: <=15,000 sq.ft. ₹21,000; <=30,000 sq.ft. ₹25,000; above 30,000 sq.ft. ₹28,000.
- Four default sections: Revenue (Sales), Construction Cost, Approval Cost, Other Costs.
- One global Add Header button. Each section has its own Add Item button.
- Formula toggle on every sub-item; formulas recalculate on project input changes.
- Manual monthly values; Monthly View and Annual View.
- Excel export: Project Inputs, individual section worksheets and Project Summary.
- Save as Draft uses browser localStorage.

FORMULA VARIABLES
Project variables: CARPET_AREA, SALEABLE_AREA, BUILTUP_AREA, PLOT_AREA, SALES_UNITS, AVG_UNIT_AREA.
Item references: use item IDs in uppercase, e.g. CIVIL_RATE.
Examples:
  SALEABLE_AREA * 28000
  BUILTUP_AREA * CIVIL_RATE
  SALES_AREA * SALES_MSP
  SALES_AMOUNT * 0.05
Math.js expression syntax is used when its CDN loads.

IMPORTANT
- This is a frontend-only prototype. Browser localStorage is local to that browser/device; there is no shared database or authentication.
- Save & Submit is a demo action, not a server submission.
- Excel export requires internet access for the SheetJS CDN.
- Formulas are evaluated in the browser. For production, validate formulas server-side with an allowlisted parser, dependency checks and circular-reference detection.
- MSP for areas above 51,500 sq.ft. currently remains ₹28,000/sq.ft. Confirm this business rule before production.
- Monthly phasing is manually entered for manual items. Formula rows recalculate from their expressions; the default Sales Amount row derives monthly amounts from monthly Sales Area × applied MSP.
