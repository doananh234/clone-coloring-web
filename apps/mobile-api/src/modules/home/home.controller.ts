import { Controller, Get } from "@nestjs/common";

import { Public } from "../../common/public.decorator";
import { HomeService } from "./home.service";

@Public()
@Controller("home")
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get()
  get() {
    return this.home.getHome();
  }
}
