/*
 * Кличний відмінок імені: «Анжела» → «Анжело», «Андрій» → «Андрію».
 * Це евристика: для більшості імен працює, а якщо ні — у генераторі
 * посилань (make.html) звертання можна виправити вручну, тоді воно
 * передається в посиланні параметром v=.
 */
window.vocative = function (name) {
  var n = String(name || '').trim();
  if (!n || /\s/.test(n) || !/[а-яіїєґ]$/i.test(n)) return n;

  var low = n.toLowerCase();
  var stem = function (k) { return n.slice(0, n.length - k); };
  var keepCase = function (s) { return n === n.toUpperCase() ? s.toUpperCase() : s; };

  if (/ія$/.test(low)) return keepCase(stem(1) + 'є');        // Марія → Маріє
  if (/я$/.test(low)) return keepCase(stem(1) + 'ю');         // Катя → Катю
  if (/а$/.test(low)) return keepCase(stem(1) + 'о');         // Анна → Анно
  if (/[йь]$/.test(low)) return keepCase(stem(1) + 'ю');      // Андрій → Андрію, Василь → Василю
  if (/о$/.test(low)) return keepCase(stem(1) + 'е');         // Петро → Петре
  if (/[гкх]$/.test(low)) return keepCase(n + 'у');           // Олег → Олегу
  if (/[бвджзлмнпрстфцчшщ]$/.test(low)) return keepCase(n + 'е'); // Назар → Назаре
  return n;
};

// Ім'я одержувача з посилання: ?to=Анжела (і необов'язково &v=Анжелочко)
window.recipientFromUrl = function () {
  var p = new URLSearchParams(location.search);
  var to = (p.get('to') || '').trim().slice(0, 40);
  if (!to) return null;
  var v = (p.get('v') || '').trim().slice(0, 40);
  return { to: to, toVocative: v || window.vocative(to) };
};
