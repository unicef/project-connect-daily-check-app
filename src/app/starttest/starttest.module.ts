import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '../shared/shared.module';
import { StarttestPage } from './starttest.page';
import { StarttestPageRoutingModule } from './starttest-routing.module';
import { PcdcHeaderComponent } from '../pcdc-header/pcdc-header.component';
import { TestDetailComponent } from './test-detail/test-detail.component';
import { FooterNavbarComponent } from './footer-navbar/footer-navbar.component';
import { FirstTestSuccessModalComponent } from '../components/first-test-success-modal/first-test-success-modal.component';
import { TracerouteComponent } from './traceroute/traceroute.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    StarttestPageRoutingModule,
    SharedModule,
  ],
  declarations: [
    StarttestPage,
    PcdcHeaderComponent,
    TestDetailComponent,
    FooterNavbarComponent,
    FirstTestSuccessModalComponent,
    TracerouteComponent,
  ],
})
export class StarttestPageModule {}
