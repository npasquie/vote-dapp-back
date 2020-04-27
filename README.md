# vote-dapp-back
back of the vote-dapp project

## developing
please start vote-dapp-build in dev mode before launching
this back-end with `yarn start`  
this permits (among other things) to export the right env vars

## config
A `config/mail-default.json` file is provided, copy-paste it into a new file 
`config/mail.json` (read on start) and edit it to config the way mails are 
sent. `config/mail.json` is in the `.gitignore` file so you can safely put your 
own mail auth data in it.  
Most fields are self-explaining.
- port : set to `null` to let nodemailer pick one automatically
- auth : don't forget to set `enableAuth` to `true` to enable auth config
- tls : taken into account only on `"secure": true`