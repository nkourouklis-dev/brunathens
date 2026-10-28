// Κοινές σταθερές για backend (Pages Functions) και frontend.

// Εικονίδια που μπορεί να διαλέξει μια επιχείρηση. Τα σχέδια (SVG) είναι στο src/app/icons.jsx.
export const ICON_KEYS = [
  'coffee', 'cup', 'pizza', 'burger', 'cake', 'icecream', 'wine', 'beer', 'utensils', 'bread',
  'scissors', 'sparkles', 'dumbbell', 'heart', 'paw', 'flower', 'shirt', 'bag', 'book', 'music',
  'car', 'bike', 'wrench', 'star', 'gift', 'crown', 'leaf', 'sun',
];

export const DEFAULT_ICON = 'star';
export const DEFAULT_REWARD_ICON = 'gift';

export const ROLES = ['owner', 'manager', 'staff'];

export const ROLE_LABELS = { owner: 'Ιδιοκτήτης', manager: 'Υπεύθυνος', staff: 'Ταμείο' };

// Slugs που δεν επιτρέπονται σε επιχειρήσεις.
export const RESERVED_SLUGS = [
  'api', 'admin', 'platform', 'invite', 'start', 'b', 'login', 'static', 'assets', 'www', 'app', 'help', 'privacy', 'terms', 'null', 'undefined',
];

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export const LIMITS = {
  logoBytes: 350 * 1024,
  nameLength: 60,
  taglineLength: 120,
  rewardNameLength: 60,
  rewardDescriptionLength: 140,
  unitLength: 20,
};
