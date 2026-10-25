-- The first business no longer ships a built-in logo; its owner uploads one in Settings.
UPDATE tenants SET logo = NULL WHERE logo = '/brun-logo.jpg';
