const fs = require('fs');
let content = fs.readFileSync('test/integration/meetups.test.ts', 'utf8');

content = content.replace(/await api\('POST', \/v1\/meetups\/\$\{id\}\/check-in, 'u_check_g1'\);/g, "await api('POST', \/v1/meetups/\/check-in\, 'u_check_g1');");
content = content.replace(/await api\('GET', \/v1\/meetups\/\$\{id\}/g, "await api('GET', \/v1/meetups/\\");
content = content.replace(/await api\('POST', \/v1\/meetups\/\$\{id\}\/check-in/g, "await api('POST', \/v1/meetups/\/check-in\");
content = content.replace(/await api\('GET', \/v1\/meetups\/\$\{createdBlocked\.body\.id as string\}/g, "await api('GET', \/v1/meetups/\\");

fs.writeFileSync('test/integration/meetups.test.ts', content);
