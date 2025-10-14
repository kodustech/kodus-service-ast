import { GetTaskInfoUseCase } from '@/core/application/use-cases/task/get-task-info.use-case';
import { GrpcExceptionFilter } from '@/core/infrastructure/filters/grpc.filter';
import {
    GetTaskInfoRequest,
    GetTaskInfoResponse,
    TaskManagerServiceController,
    TaskManagerServiceControllerMethods,
} from '@kodus/kodus-proto/task';
import { Controller, UseFilters } from '@nestjs/common';
import { Observable } from 'rxjs';

@Controller('task')
@TaskManagerServiceControllerMethods()
@UseFilters(new GrpcExceptionFilter())
export class TaskController implements TaskManagerServiceController {
    constructor(private readonly getTaskInfoUseCase: GetTaskInfoUseCase) {}

    async getTaskInfo(
        request: GetTaskInfoRequest,
    ): Promise<GetTaskInfoResponse> {
        return this.getTaskInfoUseCase.execute(request);
    }
}
