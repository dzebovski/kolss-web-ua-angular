import { Component } from '@angular/core';

import { LeadForm } from '../../features/lead-form/lead-form';

@Component({
  selector: 'app-home-page',
  imports: [LeadForm],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {}
