import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  AbstractControl,
  FormControl,
  ValidationErrors,
  Validators
} from '@angular/forms';

@Component({
  selector: 'app-save-school-email',
  templateUrl: './save-school-email.component.html',
  styleUrls: ['./save-school-email.component.scss'],
  standalone: false,
})
export class SaveSchoolEmailComponent implements OnInit {
  emailControl = new FormControl('');

  constructor(private readonly router: Router) {}

  ngOnInit() {
    this.emailControl.valueChanges.subscribe((value: string) => {
      if (value && value.length >= 1) {
        this.emailControl.setValidators([this.emailDomainValidator]);
      } else {
        this.emailControl.clearValidators();
      }
      this.emailControl.updateValueAndValidity({ emitEvent: false });
    });
  }

  addEmail() {
    if (this.emailControl.invalid) {
      this.emailControl.markAsTouched();
      return;
    }

    console.log('Email saved:', this.emailControl.value);
    this.router.navigate(['/schoolsuccess']);
  }

  skip() {
    console.log('User skipped adding email');
    this.router.navigate(['/schoolsuccess']);
  }

  emailDomainValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    const emailPattern =
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;

    return emailPattern.test(value) ? null : { invalidEmail: true };
  }
}
