import { Component, OnInit, ViewChild, ChangeDetectorRef, ElementRef } from '@angular/core';
import { IonAccordionGroup, ModalController } from '@ionic/angular';
import { ActivatedRoute, Router } from "@angular/router";
import { AlertController } from '@ionic/angular';
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { MenuController } from '@ionic/angular';
import { NetworkService } from '../services/network.service';
import { SettingsService } from '../services/settings.service';
import { MlabService } from '../services/mlab.service';
import { MeasurementClientService } from '../services/measurement-client.service';
import { SharedService } from '../services/shared-service.service';
import { HistoryService } from '../services/history.service';
import { TranslateService } from '@ngx-translate/core';
import { StorageService } from '../services/storage.service';
import { ModalPage } from 'src/components/modal.page';
@Component({
  selector: 'app-starttest',
  templateUrl: 'starttest.page.html',
  styleUrls: ['starttest.page.scss'],
})
export class StarttestPage implements OnInit {
  @ViewChild(IonAccordionGroup, { static: true }) accordionGroup: IonAccordionGroup;
  @ViewChild('errorMsg') el:ElementRef;
  currentState = undefined;
  currentRate = undefined;
  uploadStatus = undefined;
  uploadRate = undefined;
  connectionInformation: any;
  lastMeasurementId: number;
  mlabInformation= {
    "city": "",
    "url": "",
    "ip": [],
    "fqdn": "",
    "site": "",
    "country": "",
    "label": "",
    "metro": ""
  } ;
  accessInformation = {
    "ip": "", 
    "city": "", 
    "region": "", 
    "country": "", 
    "label":"",
    "metro":"",
    "site":"",
    "url":"",
    "fqdn":"",
    "loc": "", 
    "org": "", 
    "postal": "", 
    "timezone": "", 
    "asn": ""
  };
  isLoaded = false;
  progressGaugeState = {
    'type': 'full',
    'minimum': 0,
    'current': 0,
    'maximum': 1,
    'message': 'Start',
    'foregroundColor':'#FFFFFF',
    'backgroundColor':'#FFFF00'
  };
  onlineStatus: boolean;
  schools: any;
  schoolId: any;
  private sub: any;
  public currentDate:any;
  public connectionStatus:any;
  constructor(
    private route: ActivatedRoute, 
    public loading: LoadingService,
    public router:Router,
    private menu: MenuController,
    public alertController: AlertController,
    public modalController: ModalController,
    private schoolService: SchoolService,
    private networkService: NetworkService, 
    private settingsService: SettingsService,
    private mlabService: MlabService,
    private measurementClientService: MeasurementClientService,
    private sharedService: SharedService,
    private historyService: HistoryService,
    public translate: TranslateService,
    private ref: ChangeDetectorRef,
    private storage: StorageService
  ) {

    this.onlineStatus = window.navigator.onLine;
    this.route.params.subscribe(params => {
        if ( this.onlineStatus ) {
          this.measureReady();
        }        
    });
    let applicationLanguage = this.settingsService.get('applicationLanguage');
    if(applicationLanguage) {
      if( typeof applicationLanguage === 'string'){
        translate.setDefaultLang(applicationLanguage);
      } else {
        translate.setDefaultLang(applicationLanguage.code);
      }      
    }
      
    window.addEventListener('online', (e) => {
      // Re-sync data with server.
      this.onlineStatus = true;
      this.measureReady();
    }, false);

    window.addEventListener('offline', (e) => {
      // Queue up events for server.
      this.onlineStatus = false;
    }, false);

    this.sharedService.on('settings:changed', (nameValue)=>{      
      if (nameValue.name == 'applicationLanguage') {
        translate.use(nameValue.value.code);
      }
      if (nameValue.name == 'metroSelection') {
        this.tryConnectivity();
      }
    });
    if(!this.storage.get('schoolId')){
      this.router.navigate(['/home']);
    }
  }
  ngOnInit() {
    this.sharedService.on('measurement:status', this.driveGauge.bind(this));
    this.sharedService.on('history:measurement:change', this.refreshHistory.bind(this));
    this.sharedService.on('history:reset', this.refreshHistory.bind(this));
    this.refreshHistory();
  }

  measureReady() {
    let loadingMsg = '<div class="loadContent"><ion-img src="assets/loader/loader.gif" class="loaderGif"></ion-img><p class="white">Testing connectivityr...</p></div>';
    this.loading.present(loadingMsg, 3000, 'pdcaLoaderClass', 'null');
    this.tryConnectivity();
    this.isLoaded = true;
  }

  tryConnectivity() {
    this.mlabService.findServer(this.settingsService.get('metroSelection')).subscribe( res => {
      this.mlabInformation = res; 
      this.connectionStatus = "success";     
    },(err) => {
      this.loading.dismiss();
      //this.presentAlertConfirm();
      this.connectionStatus = "error";
      this.currentRate = "error";
      this.presentTestFailModal();
    });
    this.networkService.getAccessInformation().subscribe(results => {
      this.accessInformation = results;
      this.loading.dismiss();
    });
  }

  refreshHistory() {
    let data = this.historyService.get();
    this.lastMeasurementId = data.measurements.length - 1;    
  }

  openFirst() {
    this.menu.enable(true, 'first');
    this.menu.open('first');
  }

  closeMenu() {
    this.menu.open('end');
  }
  closeError(){
    this.el.nativeElement.style.display = 'none';
  }
  showTestResult(){
    this.router.navigate(['connectivitytest']);
  }

  startNDT() {
    this.currentState = 'Starting';
    this.uploadStatus = undefined;
    this.connectionStatus = "";
    this.measurementClientService.start();
  }

  driveGauge(event, data) {
    if (event === 'measurement:status') {
      if (data.testStatus === 'onstart') {
        this.currentState = 'Starting';
        this.currentRate = undefined;        
      } else if (data.testStatus === 'running_c2s') {
        this.currentState = 'Running Test (Upload)';
      } else if (data.testStatus === 'interval_c2s') {
        this.currentRate = data.passedResults.c2sRate;
      } else if (data.testStatus === 'running_s2c') {
        this.currentState = 'Running Test (Download)';
      } else if (data.testStatus === 'interval_s2c') {
        this.currentRate = data.passedResults.s2cRate;
      } else if (data.testStatus === 'complete') {
        this.currentState = 'Completed';
        this.currentDate =  new Date();
        this.currentRate = data.passedResults.s2cRate;
        this.progressGaugeState.current = this.progressGaugeState.maximum;
        this.ref.markForCheck();
        this.refreshHistory();
      } else if (data.testStatus === 'onerror') {        
        this.gaugeError();
        this.currentState = undefined;
        this.currentRate = undefined;        
        this.ref.markForCheck();
      }
      if (data.testStatus !== 'complete') {
        this.progressGaugeState.current = data.progress;
      }
    }
  }
  async presentTestFailModal() {
    const alert = await this.alertController.create({
      cssClass: 'my-custom-class',
      header: this.translate.instant('TEST FAILED'),
      message: '<strong>'+this.translate.instant('The connection was interupted before testing could be completed.')+'</strong>',
      buttons: [
        {
          text: 'Okay',
          handler: () => {}
        }
      ]
    });
    await alert.present();
  }
  async presentAlertConfirm() {
    const alert = await this.alertController.create({
      cssClass: 'my-custom-class',
      header: this.translate.instant('Error'),
      message: '<strong>'+this.translate.instant('Measurement server is not responding. Please close the app from system tray and try after sometime')+'</strong>',
      buttons: [
        {
          text: 'Okay',
          handler: () => {}
        }
      ]
    });
    await alert.present();
  }

  gaugeError() {
    this.progressGaugeState.current = this.progressGaugeState.maximum;
  }
}
