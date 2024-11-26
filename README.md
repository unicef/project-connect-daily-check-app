<div style="padding-left: 20px; padding-right: 10px;">
<a href="https://giga.global/">
    <img src="https://s41713.pcdn.co/wp-content/uploads/2018/11/2020.05_GIGA-visual-identity-guidelines_v1-25.png" alt="Giga logo" title="Giga" align="right" height="60" style="padding-top: 10px;"/>
</a>

<div style="padding-top: 20px;"> </div>
<h1><a id="gigameter" class="anchor" aria-hidden="true" href="#gigablocks"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
GigaMeter Frontend</h1> 

<div align="center" >

<!--- These are examples. See https://shields.io for others or to customize this set of shields. You might want to include dependencies, project status and licence info here --->
![GitHub repo size](https://img.shields.io/github/repo-size/unicef/project-connect-daily-check-app)
![GitHub stars](https://img.shields.io/github/stars/unicef/project-connect-daily-check-app)
![Twitter Follow](https://img.shields.io/twitter/follow/gigaglobal)
![License](https://img.shields.io/github/license/unicef/project-connect-daily-check-app)


</div>

<details open="open">
	<summary style="padding-bottom: 10px;"><h2>Table of Contents</h2></summary>
  <ol>
    <li><a href="#about-giga">About Giga</a></li>
    <li><a href="#about-gigameter">About GigaMeter</a>
    <ul>
        <li><a href="#project-objective">Project Objective</a></li>
        <li><a href="#design-and-architecture">Design and Architecture</a></li>
        <li><a href="#system-requirements">System Requirements</a></li>
        <li><a href="#giga-meter-repos">Github Repositories of GigaMeter</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
      </li>
	<li>
      <a href="#getting-started">Getting Started</a>
    </li>
    <li><a href="#contribution-guidelines">Contribution Guidelines</a></li>
    <li><a href="#code-design">Code Design</a></li>
    <li><a href="#code-of-conduct">Code of Conduct</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#contributors">Contributors</a></li>
    <li><a href="#acknowledgements">Acknowledgements</a></li>
  </ol>
</details>

<h2><a id="about-giga" class="anchor" aria-hidden="true" href="#about-giga"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>About Giga</h2>

Giga is a UNICEF-ITU global initiative to connect every school to the Internet and every young person to information, opportunity, and choice. By connecting all schools to the Internet, we ensure that every child has a fair shot at success in an increasingly digital world.

<h2><a id="about-gigameter" class="anchor" aria-hidden="true" href="#about-gigameter"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
About GigaMeter</h2>

GigaMeter is a client desktop application that can be installed on Windows that automatically measures the internet upload and download speed of a network using minimal data. The App is automatically scheduled to run four internet speed tests daily. The first test runs within 15 minutes of the device being turned on, while the remaining three runs in the following time slots of the user's machine - 8 am to 12 pm, 12 pm to 4 pm, 4 pm to 8 pm.

It can be installed on a user device (such as a computer or laptop) and configured easily to send daily internet connectivity information to a database. It utilizes the Network Diagnostic Tool (NDT), developed and maintained by Internet 2 and hosted by Measurement Lab (M-Lab). 

Giga uses GigaMeter to measure school connectivity, sending daily internet connectivity information to Giga Maps, helping Giga create an accurate picture of a school’s network quality over time. It was developed in partnership with Ericsson. 

<h3><a id="project-objective" class="anchor" aria-hidden="true" href="#project-objective"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
Project Objective</h3>

- Improve accountability and transparency by tracking the progress and quality of connectivity of schools over time 

- Easily check, understand, share, and visualize the quality of the internet service experienced in a school  

- Measure impact by generating updated estimates on the number of schools and children who have fast and reliable access to internet connectivity 

<h3><a id="design-and-architecture" class="anchor" aria-hidden="true" href="#design-and-architecture"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
Design and Architecture</h3>
<p></p>
GigaMeter is a Windows-based desktop application that can be installed on a school's computer and configured easily to send internet connectivity information to the Giga Maps database. It uses a Network Diagnostic Tool (developed and maintained by M-Lab) to test internet connectivity.


<h3><a id="system-requirements" class="anchor" aria-hidden="true" href="#system-requirements"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
System Requirements </h3>
<p></p>
To run GigaMeter, the following are the minimum requirements: 

- Internet connection 

- A Windows (Windows 7 or higher) desktop or laptop computer that is permanently and exclusively connected to the school internet. 

- 500 Mb of free disk space 

<h3><a id="built-with" class="anchor" aria-hidden="true" href="#built-with"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
Built With </h3>
 
<b>Our Tech Stacks</b>  
- Ionic - an open-source UI toolkit (version 6.0.3) 

- Angular – a TypeScript-based, free, and open-source web application framework (version 13) 

- Capacitor - Community/Electron - (version 4.1.0)  

- Electron - a framework for building desktop applications using JavaScript, HTML and CSS  

<h3><a id="giga-meter-repos" class="anchor" aria-hidden="true" href="#giga-meter-repos"><svg class="octicon octicon-link" align="center" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
Github Repositories of GigaMeter </h3>

- [GigaMeter Frontend](https://github.com/unicef/project-connect-daily-check-app)
- [GigaMeter Backend](https://github.com/unicef/giga-meter-backend)
- [Giga – documentation](#)


<h2><a id="getting-started" class="anchor" aria-hidden="true" href="#getting-started"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
Getting Started</h2>

### Setup and Running
#### Installation 

- Download the latest version from the GigaMeter website.  

    - The download will start automatically.  

    - When the download is complete, double-click on the file. This usually appears at the bottom bar of your browser. Otherwise, you will find the file in your ‘Downloads’ folder.  

    -  The installation process is straightforward. Follow the wizard by clicking ‘Next’ on each step.  

- After successfully installing the app, it will send schools' internet connectivity information to Giga Maps four times daily. 

#### Development Commands 

<b>Basic development commands</b> 

- After cloning the code from the GitHub repository
```sh
https://github.com/unicef/project-connect-daily-check-app
```
- Install all the dependencies modules by running this command: 
```sh
npm install 
```
- To run the app the application in a browser, run this command:
```sh
Ionic serve 
```
- To run the application directly during the development without creating exe, run the following command from electron folder: 
```sh
npm run electron:start-live 
```
<b>Ionic build generation</b> 

- To create a build from Ionic, run the following command: 
```sh
Ionic build (for development)
```
or
```sh
Ionic build –prod (for production)
```

- After running the above command, ionic build will be generated.  

- To transfer the build to electron side, run the following command: 
```sh
npx cap sync @capacitor-community/electron 
```
<b>Setup file generation</b>

- Navigate to the electron folder, then run the following command:
```sh
npm run electron:make 
```
- The windows build can be found inside 
```sh
/electron/dist folder 
```
 

#### Third-party Integrations 

<b>Network Diagnostic Tool</b> 

The application implements the same Network Diagnostic Tool (NDT) as the M-Lab chrome browser extension. The GigaMeter app integrates the NDT test using M-Lab's Javascript client library (for more information see [M-Lab developer resources](https://www.measurementlab.net/develop/)). The result of the test is sent as a JSON object to the application, which is then passed on to Giga Maps via the Service level API. 

<h2><a id="contribution-guidelines" class="anchor" aria-hidden="true" href="#contribution-guidelines"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
Contribution Guidelines</h2>

Thank you for considering contributing to GigaMeter! We value your input and aim to make the contribution process as accessible and transparent as possible. Whether you're interested in reporting bugs, discussing code, submitting fixes, proposing features, becoming a maintainer, or engaging with the GigaMeter community, we welcome your involvement. 

  

[Click here for detailed Contribution Guidelines](#) 

<h2><a id="code-design" class="anchor" aria-hidden="true" href="#code-design"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
Code Design</h2>

### Monorepo Structure 

Backend Application Structure 

Ionic/Angular Structure: The application business logic for GigaMeter resides in this section. Active development should reside inside the src folder of the application.

<img src="http://giga.global/wp-content/uploads/2024/10/gigameter_pic1.png" alt="Giga Meter Ionic" title="GigaMeterIonic" height="300" style="padding-left: 20px; padding-right: 10px;" />

Electron Structure: The above Ionic/Angular application is packaged and delivered as a desktop application inside this section of the code. 

<img src="http://giga.global/wp-content/uploads/2024/10/gigameter_electron.png" alt="Giga Meter Electron" title="GigaMeterElectron" height="300" style="padding-left: 20px; padding-right: 10px;" />


<h2><a id="code-of-conduct" class="anchor" aria-hidden="true" href="#code-of-conduct"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
Code of Conduct</h2>

At Giga, we're committed to maintaining an environment that's respectful, inclusive, and harassment-free for everyone involved in our project and community. We welcome contributors and participants from diverse backgrounds and pledge to uphold the standards. 

  

[Click here for detailed Code of Conduct](https://github.com/unicef/giga-blocks-documentation/blob/main/versioned_docs/version-1.0/Code-of-Conduct.md) 

<h2><a id="license" class="anchor" aria-hidden="true" href="#license"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
License</h2>

Distributed under the AGPL-3.0 License. See [LICENSE](https://github.com/unicef/project-connect-daily-check-app/blob/main/LICENSE) for more information. 

<h2><a id="contact" class="anchor" aria-hidden="true" href="#contact"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
Contact</h2>

GigaMeter Project Lead: Shilpa Arora: sharora@unicef.org 

GigaMeter Project Member: Vipul Bhavsar: vbhavsar@unicef.org 

Giga Open-Source Community Manager: David Njagah: dnjagah@unicef.org 

Giga Website: https://giga.global/contact-us/ 

<br>

<h2><a id="acknowledgements" class="anchor" aria-hidden="true" href="#acknowledgements"><svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"></path></svg></a>
Acknowledgments💜</h2> 

* Thanks to Ericsson for helping build this application!

</div>
