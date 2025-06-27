import { GetTaskInfoUseCase } from '@/core/application/use-cases/task/get-task-info.use-case';
import {
    GetTaskInfoRequest,
    GetTaskInfoResponse,
    TaskManagerServiceController,
    TaskManagerServiceControllerMethods,
} from '@kodus/kodus-proto/task';
import { Controller } from '@nestjs/common';
import { Observable } from 'rxjs';

@Controller('task')
@TaskManagerServiceControllerMethods()
export class TaskController implements TaskManagerServiceController {
    constructor(private readonly getTaskInfoUseCase: GetTaskInfoUseCase) {}

    getTaskInfo(
        request: GetTaskInfoRequest,
    ):
        | Promise<GetTaskInfoResponse>
        | Observable<GetTaskInfoResponse>
        | GetTaskInfoResponse {
        return this.getTaskInfoUseCase.execute(request);
    }
}
