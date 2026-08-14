import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ChangeDetectorRef } from '@angular/core';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-footer-navbar',
  templateUrl: './footer-navbar.component.html',
  styleUrls: ['./footer-navbar.component.scss'],
  standalone: false,
})
export class FooterNavbarComponent implements OnInit, OnDestroy {
  activeSegment: string = 'home';
  private routerSubscription!: Subscription;

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    // Subscribe to router events
    this.routerSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        console.log('hrihih', this.router.url);
        // Check the current URL and set the segment accordingly
        if (this.router.url.startsWith('/starttest')) {
          if (this.router.url.includes('/detail-page/')) {
            this.activeSegment = 'about';
            this.cdr.detectChanges();

            console.log('about');
          } else {
            this.activeSegment = 'home';
            this.cdr.detectChanges();

            console.log('home');
          }
        } else {
          // Default fallback if needed
          this.activeSegment = 'home';
        }
      }
    });
  }

  isNativeApp(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  onSegmentChange(event: any) {
    // If user taps segment, navigate accordingly
    if (event.detail.value === 'home') {
      this.router.navigate(['/starttest']);
    } else if (event.detail.value === 'about') {
      this.router.navigate(['/starttest/detail-page/23']);
    }
  }
  ngOnDestroy() {
    this.routerSubscription.unsubscribe();
  }
}
