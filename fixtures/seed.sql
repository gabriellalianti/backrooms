PRAGMA foreign_keys = ON;

INSERT OR REPLACE INTO users (email, display_name, role, active) VALUES
  ('director@backrooms.local', 'Fixture Director', 'admin', 1),
  ('staff@backrooms.local', 'Fixture Staff', 'staff', 1),
  ('viewer@backrooms.local', 'Fixture Viewer', 'viewer', 1);

INSERT OR REPLACE INTO products
  (id, name, normalized_name, location, source_row, active, page_url, price_cents, metadata_state, sheet_synced_at, metadata_refreshed_at)
VALUES
  ('veroboard-9x15', '9x15cm Veroboard', '9x15cm veroboard', '17G', 2, 1, NULL, NULL, 'unavailable', '2026-09-14T22:00:00Z', NULL),
  ('aa-battery', 'AA battery', 'aa battery', '18A', 3, 1, NULL, NULL, 'unavailable', '2026-09-14T22:00:00Z', NULL),
  ('amber-led', 'Amber LED - clear', 'amber led - clear', '13E', 4, 1, NULL, 20, 'last_known', '2026-09-14T22:00:00Z', '2026-08-20T02:00:00Z'),
  ('n20-motor', 'N20 Motor 1000 rpm @ 6V 9.7g', 'n20 motor 1000 rpm @ 6v 9.7g', 'STALL', 5, 1, 'https://store.createunsw.com.au/n20-motor-1000-rpm-6v-9-7g', NULL, 'unavailable', '2026-09-14T22:00:00Z', NULL),
  ('xt60-connectors', 'XT 60 connectors', 'xt 60 connectors', '18D', 6, 1, NULL, NULL, 'unavailable', '2026-09-14T22:00:00Z', NULL),
  ('short-range-rf', 'Short Range RF', 'short range rf', '14C', 7, 1, 'https://store.createunsw.com.au/short-range-rf', 400, 'current', '2026-09-14T22:00:00Z', '2026-09-10T03:30:00Z'),
  ('9v-battery', '9V battery', '9v battery', '18B', 8, 1, 'https://store.createunsw.com.au/9v-battery', 350, 'current', '2026-09-14T22:00:00Z', '2026-09-10T03:30:00Z'),
  ('big-motor-driver', 'Big Motor Driver', 'big motor driver', '12F', 9, 1, 'https://store.createunsw.com.au/big-motor-driver', 800, 'current', '2026-09-14T22:00:00Z', '2026-09-10T03:30:00Z'),
  ('yellow-wheel', 'yellow wheel 65 mm', 'yellow wheel 65 mm', '16C', 10, 1, NULL, 300, 'last_known', '2026-09-14T22:00:00Z', '2026-07-01T01:00:00Z'),
  ('plastic-dc-motor', 'Plastic Geared DC Motor', 'plastic geared dc motor', '16B', 11, 1, 'https://store.createunsw.com.au/plastic-geared-dc-motor', 350, 'current', '2026-09-14T22:00:00Z', '2026-09-10T03:30:00Z'),
  ('bluetooth-hc05', 'Bluetooth Module (HC-05)', 'bluetooth module (hc-05)', '14A', 12, 1, 'https://store.createunsw.com.au/bluetooth-module-hc-05', 1500, 'current', '2026-09-14T22:00:00Z', '2026-09-10T03:30:00Z'),
  ('servo-sg90', 'Small Plastic-Geared Servo', 'small plastic-geared servo', '15D', 13, 1, 'https://store.createunsw.com.au/small-plastic-geared-servo', 600, 'current', '2026-09-14T22:00:00Z', '2026-09-10T03:30:00Z'),
  ('ultrasonic-hcsr04', 'Ultrasonic Sensor', 'ultrasonic sensor', NULL, 14, 1, 'https://store.createunsw.com.au/ultrasonic-sensor', 400, 'current', '2026-09-14T22:00:00Z', '2026-09-10T03:30:00Z');

INSERT OR REPLACE INTO orders
  (id, source_message_id, date_added, source_status, comments, collection_state, version, imported_at, updated_at)
VALUES
  ('3999', 'fixture-message-3999', '2026-07-29', 'Pending Delivery', NULL, 'pending', 1, '2026-07-29T02:00:00Z', '2026-07-29T02:00:00Z'),
  ('3991', 'fixture-message-3991', '2026-07-27', 'Pending Delivery', 'Urgent pickup, we arranged to pick it up tmr (tues) 9am outside MCIC', 'pending', 1, '2026-07-27T02:00:00Z', '2026-07-27T02:00:00Z'),
  ('3946', 'fixture-message-3946', '2026-07-04', 'Pending Delivery', 'Just checking is the next stall on the 16th of July? If not when is the next date I can pick this up?', 'pending', 1, '2026-07-04T02:00:00Z', '2026-07-04T02:00:00Z'),
  ('3928', 'fixture-message-3928', '2026-07-01', 'Pending Delivery', NULL, 'pending', 1, '2026-07-01T02:00:00Z', '2026-07-01T02:00:00Z');

INSERT OR REPLACE INTO order_items
  (id, order_id, raw_name, quantity, line_total_cents, product_id, match_status, sort_order)
VALUES
  ('3999-1', '3999', 'Short Range RF (nRF24L01+)', 2, 800, 'short-range-rf', 'parenthetical', 1),
  ('3999-2', '3999', '9V battery ( N/A)', 2, 700, '9v-battery', 'parenthetical', 2),
  ('3991-1', '3991', 'Big Motor Driver ( L298N)', 1, 800, 'big-motor-driver', 'parenthetical', 1),
  ('3946-1', '3946', 'Small Plastic-Geared Servo ( SG90)', 1, 600, 'servo-sg90', 'parenthetical', 1),
  ('3946-2', '3946', 'Ultrasonic Sensor ( HC-SR04)', 1, 400, 'ultrasonic-hcsr04', 'parenthetical', 2),
  ('3928-1', '3928', 'yellow wheel 65 mm ( N/A)', 2, 600, 'yellow-wheel', 'parenthetical', 1),
  ('3928-2', '3928', 'Plastic Geared DC Motor ( N/A)', 2, 700, 'plastic-dc-motor', 'parenthetical', 2),
  ('3928-3', '3928', 'Bluetooth Module (HC-05) (HC-05)', 1, 1500, 'bluetooth-hc05', 'parenthetical', 3);

INSERT OR REPLACE INTO sync_runs
  (id, kind, status, started_at, finished_at, records_seen, records_changed)
VALUES
  ('fixture-catalogue-sync', 'catalogue', 'succeeded', '2026-09-14T22:00:00Z', '2026-09-14T22:00:01Z', 13, 13),
  ('fixture-order-sync', 'orders', 'succeeded', '2026-09-14T23:00:00Z', '2026-09-14T23:00:01Z', 5, 4);
