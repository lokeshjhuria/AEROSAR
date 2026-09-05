/* Demo data is deliberately isolated from the production adapter. Replace this module or disable demo mode in production. */
window.AEROSAR_DEMO = {
  platformName: 'AEROSAR', missionName: 'Operation Northstar', missionId: 'OP-NSTAR-042', missionLocation: 'Kullu Valley / Sector 07', missionPhase: 'SEARCH IN PROGRESS', missionTimerSeconds: 7428, droneId: 'DR-01',
  mapSectors: [{ label: 'SECTOR A', className: 'zone-a' }, { label: 'SECTOR B', className: 'zone-b' }, { label: 'SECTOR C', className: 'zone-c' }],
  droneStatus: 'IN FLIGHT', connectionStatus: 'CONNECTED', aiStatus: 'PROCESSING', operatorName: 'Maya Chen', operatorInitials: 'MC', mapMode: 'LIVE FEED', coordinates: '32°02\'41.8" N 77°06\'12.4" E', droneModel: 'MAV-X4', battery: '68%', batteryTime: '24 MIN REMAINING', altitude: '142 M', speed: '18.4 KM/H', temperature: '16°C', weather: 'CLEAR', flightTime: '01:18:42', gpsStatus: '3D FIX', heading: 'NNE 024°', lastInference: 'UPDATED 12 SEC AGO', lastSync: '12 SEC AGO', dataSource: 'DEMO ENGINE', lastSyncFooter: '12 SEC AGO',
  detections: [
    { type: 'PERSON', confidence: '94%', location: 'Sector B / 240 m', time: '12 sec ago', priority: 'HIGH', icon: '●' },
    { type: 'THERMAL ANOMALY', confidence: '81%', location: 'Sector A / 518 m', time: '48 sec ago', priority: 'REVIEW', icon: '◉' },
    { type: 'VEHICLE', confidence: '76%', location: 'Sector C / 102 m', time: '2 min ago', priority: 'LOW', icon: '□' }
  ],
  tasks: [
    { title: 'Review person detection', detail: 'Sector B / confidence 94%', status: 'URGENT', icon: '!' },
    { title: 'Dispatch ground team', detail: 'Waypoint B-04 ready', status: 'READY', icon: '↗' },
    { title: 'Confirm thermal anomaly', detail: 'Sector A / confidence 81%', status: 'PENDING', icon: '?' }
  ]
};
