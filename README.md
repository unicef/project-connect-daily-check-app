# UNICEF PDCA

Daily Check App

To create build from ionic, need to run this command.

`ionic build` (For dev environment)

OR

`ionic build --prod` (For production environment)

After running this command the build will be generated. Now we need to transfer the build to electron. For doing this we need to run the following command.

`npx cap sync @capacitor-community/electron`

After that we need to go inside the electron folder

`cd .\electron\`

After that, to create the windows build (.exe or msi), run the following command

`npm run electron:make`

The windows build can be found inside /electron/dist/ folder.
