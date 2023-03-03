import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from "@angular/router";
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { StorageService } from '../services/storage.service';
import { NetworkService } from '../services/network.service';

import { School } from '../models/models';
import { Device } from '@capacitor/device';
import { DatePipe } from '@angular/common';
@Component({
  selector: 'app-confirmschool',
  templateUrl: 'confirmschool.page.html',
  styleUrls: ['confirmschool.page.scss'],
})
export class ConfirmschoolPage {
  @ViewChild(IonAccordionGroup, { static: true }) accordionGroup: IonAccordionGroup;
  school: any;
  schoolId: any;
  sub: any;
  constructor(
    private activatedroute: ActivatedRoute, 
    public router: Router,
    private schoolService: SchoolService,
    private storage: StorageService,
    private networkService: NetworkService, 

    public loading: LoadingService,
    private datePipe:DatePipe
  ) {
    this.sub = this.activatedroute.params.subscribe(params => {
      this.schoolId = params.schoolId;
      if(this.router.getCurrentNavigation()){
        this.school = this.router.getCurrentNavigation().extras.state as School;
      }      
    });   
  }
  
  confirmSchool(){
    /* Store school id and giga id inside storage */
    let schoolData = {};
    let today = this.datePipe.transform(new Date(), 'yyyy-MM-ddah:mm:ssZZZZZ');
    this.networkService.getAccessInformation().subscribe(c => {
      this.getDeviceInfo().then(a => {
        this.getDeviceId().then(b => {
          schoolData = {
            giga_id_school: this.school.giga_id_school,
            mac_address: b.uuid,
            os: a.operatingSystem,
            app_version: "1.0.0",
            created: today,
            ip_address: c.ip,
            country_code: c.country,
            school_id: this.school.school_id
          };
          console.log('network',c)
          if(this.school.code === c.country){
            this.schoolService.registerSchoolDevice(schoolData).subscribe((response) => {
              this.storage.set('deviceType', a.operatingSystem);
              this.storage.set('macAddress', b.uuid);
              this.storage.set('schoolUserId', response);
              this.storage.set('schoolId', this.schoolId);
              this.storage.set('gigaId', this.school.giga_id_school);
              this.storage.set('ip_address', c.ip);
              this.storage.set('country_code', c.country);
              this.storage.set('school_id', this.school.school_id);
              this.storage.set('schoolInfo', JSON.stringify(this.school));
              this.loading.dismiss();
              this.router.navigate(['/schoolsuccess']);
            }), (err) => {
              this.loading.dismiss();
              this.router.navigate(['schoolnotfound', this.schoolId]);
              /* Redirect to no result found page */
            }

          } else{

           
            this.loading.dismiss();
            this.router.navigate(['invalidlocation', 
            this.schoolId, 
               this.school.country,
               c.country + " (" +c.city + ")"
            
           ]);

          }
          
        });
      })
    });
  }

  async getDeviceInfo(){
    const info = await Device.getInfo();
    return info;
  }

  async getDeviceId(){
    const deviceId = await Device.getId();
    return deviceId;
  }
}
