<a href="https://giga.global/">
    <img src="https://s41713.pcdn.co/wp-content/uploads/2018/11/2020.05_GIGA-visual-identity-guidelines_v1-25.png" alt="Giga logo" title="Giga" align="right" height="60"/>
</a>

# Project Connect Daily Check App (PCDCA)
<br>

<div align="center">

<!--- These are examples. See https://shields.io for others or to customize this set of shields. You might want to include dependencies, project status and licence info here --->
![GitHub repo size](https://img.shields.io/github/repo-size/unicef/project-connect-daily-check-app)
![GitHub stars](https://img.shields.io/github/stars/unicef/project-connect-daily-check-app)
![Twitter Follow](https://img.shields.io/twitter/follow/gigaglobal)
![License](https://img.shields.io/github/license/unicef/project-connect-daily-check-app)


</div>


The [Daily Check App](https://projectconnect.unicef.org/daily-check-app) is a Windows desktop application that automatically measures the internet upload and download speed of a network using minimal data. The App is automatically scheduled to run two random internet speed tests daily.

It can be installed on a user device (such as a computer or laptop) and configured easily to send daily internet connectivity information to a database. It utilizes the Network Diagnostic Tool (NDT), developed and maintained by Internet 2 and hosted by [Measurement Lab (M-Lab)](https://github.com/m-lab/ndt7-js).

Giga uses the Daily Check App to measure school connectivity, sending daily internet connectivity information to [Project Connect](https://projectconnect.unicef.org/map), helping Giga create an accurate picture of a school’s network quality over time. It was developed in partnership with Ericsson. 

### About Giga

[Giga](https://giga.global/) is a UNICEF-ITU global initiative to connect every school to the Internet and every young person to information, opportunity, and choice. By connecting all schools to the Internet, we ensure that every child has a fair shot at success in an increasingly digital world.

<br>

<div align="center">

[Getting started](##getting-started) •
[Deployment](##deployment-and-usage) •
[Contributing](##contributing) •
[Integrations](##third-party-integrations) •
[Contact](##contact) •
[License](##license) •
[Acknowledgments](##acknowledgments)

</div>
<br>

## Getting Started

### Prerequisites

The Daily Check App supports development and distribution on the following platforms:
<!--- These are just example requirements. Add, duplicate or remove as required --->
* Windows, running Windows 7 or higher (ideally a device that is permanently and exclusively connected to the school internet)


### Installing The Daily Check App

To install The Daily Check App, download the latest version from this repo or from the [Daily Check App website](https://projectconnect.unicef.org/daily-check-app).

<br>

## Deployment and Usage
<!--- These section can be about deployment and/or usage. See https://shields.io for others or to customize this set of shields. You might want to include dependencies, project status and licence info here --->

### Deploying The Daily Check App

After cloning this repo, install all the dependency modules by running `npm install`

To run the app the application in a browser, run `ionic serve`

To run the application directly during development without creating an exe, run the following command from the electron folder `npm run electron:start-live`

To create a build from ionic, for dev environment run:

```
ionic build
```

OR, for production environment:

```
ionic build --prod 
```

After running this command the build will be generated. To transfer the build to electron run the following command:

```
npx cap sync @capacitor-community/electron
```

After that, navigate to the electron folder

```
cd .\electron\
```

and create the windows build (.exe or msi) by runing the following command:

```
npm run electron:make
```

The windows build can be found inside `/electron/dist/folder`

## Features
* Checks school internet connection using minimal data (obtains metrics such as upload and download speed, latency, IP address, etc)
* Automatically detects the country of a user 
* Uploads results to a public database

#### Built With
* [Ionic](https://ionicframework.com/) - an open-source UI toolkit (version 6.0.3)
* [Angular](https://angular.io/) - a TypeScript-based, free and open-source web application framework (version 13)
* [Capacitor](https://capacitorjs.com/) - an open source native runtime for building Web Native apps (version 4.1.0)
* [Electron](https://www.electronjs.org/) - a framework for building desktop applications using JavaScript, HTML and CSS

#### Network Diagnostic Tool 
The application implements M-Lab's Network Diagnostic Tool (NDT) using M-Lab's Javascript client library (for more information see [M-Lab developer resources](https://www.measurementlab.net/develop/)). The result of the test is sent as a JSON object to the application, which is then passed on to a database via an API. 

The PCDC App uses the following NDT (Network Diagnostic Tool) library for JavaScript, downloaded from mLab
* NDT Client
    * Resides inside Ionic/Angular application `/src/assets/js/ndt/ndt-browser-client.js`
* NDT worker
    * Resides inside Ionic/Angular application `/src/assets/js/ndt/ndt-worker.js`


<br>

<!--- ## Contributing to <project_name>--->
<!--- If your README is long or you have some specific process or steps you want contributors to follow, consider creating a separate CONTRIBUTING.md file--->
<!---To contribute to <project_name>, follow these steps:

1. Fork this repository.
2. Create a branch: `git checkout -b <branch_name>`.
3. Make your changes and commit them: `git commit -m '<commit_message>'`
4. Push to the original branch: `git push origin <project_name>/<location>`
5. Create the pull request.--->

<!---Alternatively see the GitHub documentation on [creating a pull request](https://help.github.com/en/github/collaborating-with-issues-and-pull-requests/creating-a-pull-request).--->

<!---### Contributors--->

## Contributors

Thanks to the following people who have contributed to this project:

* [@sanoylab - Senior Software Developer @Giga](https://github.com/sanoylab) 📖
* [@shilpa9a - Data & Mapping Product Lead @Giga](https://github.com/shilpa9a) 🐛

<br>

## Contact

If you want to contact us, please [submit a form here](https://projectconnect.unicef.org/daily-check-app#contact-us).

<br>

## License
<!--- If you're not sure which open license to use see https://choosealicense.com/--->

This project uses the following license: [<license_name>](<link>).

<br>

## Acknowledgments
* Thanks to Ericsson for helping build this application!
