-- Holder role display catalog (from legacy roles table).
-- User membership is fetched live from Discord; this table is metadata only.

INSERT INTO discord_role_catalog (discord_role_id, display_name, color, emoji_url, sort_order)
VALUES
  ('1300968964276621313', 'AI energy ape', '#bbbaba', '/emojis/globe.svg', 1),
  ('1300969147441610773', 'Rjctd bot', '#bbbaba', '/emojis/globe.svg', 2),
  ('1300968613179686943', 'AI squirrel', '#bbbaba', '/emojis/globe.svg', 3),
  ('1300969268665389157', 'Candy bot', '#bbbaba', '/emojis/globe.svg', 4),
  ('1300969353952362557', 'Doodle bot', '#bbbaba', '/emojis/globe.svg', 5),
  ('1300968343783735296', 'AI warrior', '#bbbaba', '/emojis/globe.svg', 6),
  ('1095034117877399686', 'BITBOT', '#097e67', '/emojis/BITBOT.webp', 7),
  ('1095335098112561234', 'CELEB', '#5dffd8', '/emojis/CELEB.webp', 8),
  ('1095033759612547133', 'CAT', '#7e6ff7', '/emojis/CAT.webp', 9),
  ('1095338675224707103', 'MM TOP 10', '#48a350', '/emojis/MMTOP10.webp', 10),
  ('1093607056696692828', 'MONSTER', '#fc7c7c', '/emojis/MONSTER.webp', 11),
  ('1093607187454111825', 'MONSTER 3D', '#ff0000', '/emojis/MONSTER 3D.webp', 12),
  ('1095338840178294795', 'MM3D TOP 10', '#6ad1a0', '/emojis/MM3DTOP10.webp', 13),
  ('1248428373487784006', 'BUX$DAO 5', '#00be22', '/emojis/BUX.webp', 14),
  ('1095363984581984357', 'BUX BANKER', '#daff00', '/emojis/BUX.webp', 15),
  ('1248416679504117861', 'BUX BEGINNER', '#daff00', '/emojis/BUX.webp', 16),
  ('1248417674476916809', 'BUX BUILDER', '#daff00', '/emojis/BUX.webp', 17),
  ('1248417591215784019', 'BUX SAVER', '#daff00', '/emojis/BUX.webp', 18),
  ('1095033899492573274', 'MEGA BOT 🐋', '#e1f2a1', '/emojis/MEGA BOT 🐋.webp', 19),
  ('1095033566070583457', 'CAT 🐋', '#0500fd', '/emojis/CAT 🐋 .webp', 20),
  ('1093606438674382858', 'MONSTER 🐋', '#7294ab', '/emojis/MONSTER 🐋.webp', 21),
  ('1093606579355525252', 'MONSTER 3D 🐋', '#52b4f3', '/emojis/MONSTER 3D 🐋.webp', 22)
ON CONFLICT (discord_role_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  color = EXCLUDED.color,
  emoji_url = EXCLUDED.emoji_url,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
