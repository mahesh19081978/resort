import re
path = r'D:\xampp\htdocs\Projects--git\resort\scripts\browser-checkin-test.ts'
data = open(path, 'r', encoding='utf-8').read()
# Replace single $ selector calls with $$
fixed = re.sub(r'page\.\$\(', r'page.$$(', data)
open(path, 'w', encoding='utf-8').write(fixed)
count = fixed.count('page.$$')
print('Fixed. page.$$ occurrences:', count)
