# Data Sources

National DMS Dashboard aggregates publicly accessible dynamic-message-sign data from transportation agencies. It is unofficial and is not affiliated with any agency listed below.

Endpoints can change, become unavailable, or return incomplete data without notice. The originating agency remains the authoritative source.

## Included sources

| State or region | Agency or service | Coverage | Public source | Notes |
|---|---|---|---|---|
| New York | 511NY | Statewide | `https://511ny.org` | Public site session and verification token are obtained at runtime; no credentials are stored. |
| Texas | TxDOT ITS | Statewide by district | `https://its.txdot.gov` | District feeds are queried individually. |
| Pennsylvania | 511PA | Statewide | `https://www.511pa.com` | Shared 511-family adapter with pagination. |
| Georgia | 511GA | Statewide | `https://511ga.org` | Shared 511-family adapter with pagination. |
| Louisiana | 511LA | Statewide | `https://www.511la.org` | Shared 511-family adapter with pagination. |
| Wisconsin | 511WI | Statewide | `https://511wi.gov` | Shared 511-family adapter with pagination. |
| Arizona | AZ 511 | Statewide | `https://www.az511.com` | Shared 511-family adapter with pagination. |
| Maryland | CHART | Statewide | `https://chart.maryland.gov/DataFeeds/GetDmsJson` | Public JSON feed. |
| Virginia | Virginia 511 | Statewide | `https://511.vdot.virginia.gov/services/map/layers/map/dms` | Public map-layer feed. |
| Maine, New Hampshire, Vermont | New England 511 | Multi-state | `https://newengland511.org` | Regional shared feed. |
| Alaska | Alaska 511 | Partial | `https://511.alaska.gov` | Public 511-family feed. |
| Nevada | Nevada Roads | Statewide | `https://www.nvroads.com` | Public 511-family feed. |
| Florida | FL511 | Statewide | `https://fl511.com` | Public 511-family feed. |
| Idaho | Idaho 511 | Statewide | `https://511.idaho.gov` | Public 511-family feed. |
| North Carolina | DriveNC | Statewide | `https://www.drivenc.gov` | Public 511-family feed. |
| California | Kern 511 | Partial | `https://www.kern511.com` | Kern-region coverage only; not statewide California coverage. |
| Iowa | Iowa DOT ArcGIS | Statewide | `https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/DMS_View/FeatureServer` | ArcGIS FeatureServer with message and NTCIP fields. |
| Oklahoma | OKTraffic | Statewide | `https://oktraffic.org/api/Signs` | Public JSON API using an include/filter header. |
| Buffalo–Niagara | NITTEC | Regional | `https://www.nittec.org/content/json/nittec.js` | Imports VMS records only; bridge wait-time data is intentionally ignored. |

## Currently unavailable or incomplete

- Alabama: no confirmed public Alabama DMS feed has been found. The tested `TravelerInformationSystems` endpoint is a directory of neighboring traveler-information systems, not a physical-sign feed.
- California: only Kern-region signs are currently included.
- Other states may be absent because no stable, public, keyless DMS source has been confirmed.

## Shared 511-family adapter

Several sites expose message signs through a public endpoint resembling:

```text
/List/GetData/MessageSigns
```

The adapter opens the public message-sign page, obtains any public runtime session or verification token, paginates through all available records, and normalizes them. No copied browser cookies or private credentials are stored.

## Normalized data

Sources are converted into a common representation containing available fields such as:

```json
{
  "id": "source-specific-id",
  "state": "NY",
  "agency": "NYSDOT",
  "name": "Example sign",
  "roadway": "I-90",
  "direction": "Eastbound",
  "latitude": 43.0,
  "longitude": -78.8,
  "message": "CURRENT SIGN MESSAGE",
  "pages": [["PAGE ONE"], ["PAGE TWO"]],
  "active": true,
  "updatedAt": "2026-07-02T12:00:00Z",
  "sourceUrl": "https://example.gov/"
}
```

Not every source provides every field.

## Attribution and use

All traffic data remains the property of its originating agency. This project only retrieves, normalizes, and displays publicly accessible information.

Do not rely on this dashboard as the sole source for emergency instructions, evacuations, closures, or safe routing. Consult the responsible agency and emergency authorities.
