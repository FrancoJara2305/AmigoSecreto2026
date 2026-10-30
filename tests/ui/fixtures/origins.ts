// Fixed local pairs only. A full regression can coexist with the user's 4173 preview.
export const uiPort=process.env.APP_SECURITY_UI_TEST==='1'?4183:process.env.APP_UI_ISOLATED==='1'?4185:4173;
export const uiOrigin=`http://127.0.0.1:${uiPort}`;
export const apiOrigin=`http://127.0.0.1:${uiPort+1}`;
