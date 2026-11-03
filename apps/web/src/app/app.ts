import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PhoneFrameComponent } from './core/shells/phone-frame.component';

@Component({
  selector: 'gw-root',
  imports: [RouterOutlet, PhoneFrameComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
