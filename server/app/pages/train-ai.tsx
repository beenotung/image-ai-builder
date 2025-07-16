import { o } from '../jsx/jsx.js'
import { Routes } from '../routes.js'
import { apiEndpointTitle, title } from '../../config.js'
import Style from '../components/style.js'
import {
  Context,
  DynamicContext,
  getContextFormBody,
  throwIfInAPI,
} from '../context.js'
import { mapArray } from '../components/fragment.js'
import { IonBackButton } from '../components/ion-back-button.js'
import { float, int, object, string, values } from 'cast.ts'
import { Link, Redirect } from '../components/router.js'
import { renderError } from '../components/error.js'
import { getAuthUser } from '../auth/user.js'
import { evalLocale, Locale, Title } from '../components/locale.js'
import { Script } from '../components/script.js'
import { Chart, ChartScript } from '../components/chart.js'
import { toRouteUrl } from '../../url.js'
import { EarlyTerminate } from '../../exception.js'
import { sessions } from '../session.js'
import { ServerMessage } from '../../../client/types.js'
import { sleep } from '@beenotung/tslib/async/wait.js'
import { del, notNull, pick } from 'better-sqlite3-proxy'
import { proxy } from '../../../db/proxy.js'
import { db } from '../../../db/db.js'

let pageTitle = (
  <Locale en="Train AI Model" zh_hk="訓練 AI 模型" zh_cn="训练 AI 模型" />
)

let style = Style(/* css */ `
#TrainAI {

}
ion-range::part(pin) { /*always show pin number*/
  bborder-radius: 50%;
  transform: scale(1.01);
  top: -20px;
}
`)

let script = Script(/* js */ `
// Learning Rate Elements
learning_rate = document.querySelector('#learning_rate'); 
learning_rate_input = document.querySelector('#learning_rate_input');

// Epoch Elements
epoch_no = document.querySelector('#epoch_no');
epoch_no_input = document.querySelector('#epoch_no_input');

//change default pin formatter from integer to float
learning_rate.pinFormatter = (value) => {
  // Format the value to 2 decimal places
  return value.toFixed(2);
}

//sync data of slider and input
learning_rate.addEventListener('ionChange', ({ detail }) => {
  learning_rate_input.value = detail.value
  learning_rate.pinFormatter = (value) => {
  // Format the value to 2 decimal places
  value = learning_rate.value
  return value.toFixed(2);
}
});

learning_rate_input.addEventListener('ionChange', ({ detail }) => {
  learning_rate.value = detail.value
  learning_rate.pinFormatter = (value) => {
    return learning_rate.value;
  }
});

epoch_no.addEventListener('ionChange', ({ detail }) => {
  epoch_no_input.value = detail.value
  epoch_no.pinFormatter = (value) => {
    return epoch_no.value;
  }
});

epoch_no_input.addEventListener('ionChange', ({ detail }) => {
  epoch_no.value = detail.value
  epoch_no.pinFormatter = (value) => {
    return epoch_no.value;
  }
});

//ignore enter key to submit form
function cancelEnterSubmit(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
  }
}
`)

let page = (
  <>
    {style}
    <ion-header>
      <ion-toolbar>
        <IonBackButton href="/" backText="Home" />
        <ion-title role="heading" aria-level="1">
          {pageTitle}
        </ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content id="TrainAI" class="ion-padding">
      <h2>
        <Locale
          en="Model Training Setting"
          zh_hk="模型訓練設定"
          zh_cn="模型训练设置"
        ></Locale>
      </h2>
      <Main />
    </ion-content>
    {script}
  </>
)

//get label title from label_id
const get_label_title = db
  .prepare<{ label_id: number }, { title: string }>(
    /* sql */ `
  select label.title
  from label
  where id = :label_id
  limit 1
`,
  )
  .pluck()

const model_labels = () => {
  let model_labels = []
  for (let row of proxy.label) {
    model_labels.push(row.title)
  }
  return model_labels
}

//check how many models are there
const count_model = () => {
  let model_no = 0
  for (let row of proxy.label) {
    if (row.id && row.id > model_no) {
      model_no = row.id
    }
  }
  return model_no
}

const MODEL_NO = count_model()

function Main(attrs: {}, context: Context) {
  let user = getAuthUser(context)

  //get data from training_stats table on database and group by label_id (support multiple models)
  let statsByModel: Record<
    number,
    {
      label_id: number
      epochs: number[]
      train_loss: number[]
      val_loss: number[]
      train_accuracy: number[]
      val_accuracy: number[]
    }
  > = {}

  for (let row of proxy.training_stats) {
    if (!statsByModel[row.label_id]) {
      statsByModel[row.label_id] = {
        label_id: row.label_id,
        epochs: [],
        train_loss: [],
        val_loss: [],
        train_accuracy: [],
        val_accuracy: [],
      }
    }
    statsByModel[row.label_id].epochs.push(row.epoch)
    statsByModel[row.label_id].train_loss.push(row.train_loss)
    statsByModel[row.label_id].val_loss.push(row.val_loss)
    statsByModel[row.label_id].train_accuracy.push(row.train_accuracy)
    statsByModel[row.label_id].val_accuracy.push(row.val_accuracy)
  }

  //get datasets for chart drawing
  /* example
  data: [{label: 'Model (label.title) train_loss', data: [1, 2, 3]}, {label: 'Model (label.title) val_loss', data: [4, 5, 6]}]
  */
  function getDatasets(key: string) {
    return Object.values(statsByModel).map(model => ({
      label: `Model ${get_label_title.get({ label_id: model.label_id })} ${key}`,
      data: model[key as keyof typeof model] as number[],
    }))
  }

  //get epochs for chart drawing
  let chart_label: string[] = []
  const statsValues = Object.values(statsByModel)
  if (statsValues.length > 0) {
    chart_label = statsValues[0].epochs.map(epoch => epoch.toString())
  }

  return (
    <form
      method="POST"
      action={toRouteUrl(routes, '/train-ai/train')}
      onsubmit="emitForm(event)"
    >
      <ion-item>
        <ion-label>
          <Locale en="Learning Rate:" zh_hk="學習率:" zh_cn="学习率:" />
        </ion-label>
        {/* Learning Rate Slider */}
        <ion-range
          id="learning_rate"
          step="0.01"
          pin
          ticks
          snaps
          value="0.03"
          min="0.01"
          max="0.1"
          aria-label="Custom range"
        ></ion-range>
        <ion-input
          id="learning_rate_input"
          name="learning_rate"
          type="text"
          inputmode="numeric"
          pattern="[0-9]+.?[0-9]*"
          maxlength="10"
          min="0"
          style="width: 25%; font-size: 16px;"
          placeholder="Numbers only"
          value="0.03"
          step="0.01"
          onkeypress="cancelEnterSubmit(event)"
        ></ion-input>
      </ion-item>
      <ion-item>
        <ion-label>
          <Locale en="Epoch to train:" zh_hk="訓練輪數:" zh_cn="训练轮数:" />
        </ion-label>
        {/* Epoch Slider */}
        <ion-range
          id="epoch_no"
          step="5"
          pin
          ticks
          snaps
          value="20"
          min="0"
          max="100"
          aria-label="Custom range"
        ></ion-range>
        <ion-input
          name="epoch_no"
          id="epoch_no_input"
          type="text"
          inputmode="numeric"
          pattern="[0-9]+"
          maxlength="10"
          min="0"
          style="width: 25%; font-size: 16px;"
          placeholder="Numbers only"
          value="20"
          onkeypress="cancelEnterSubmit(event)"
        ></ion-input>
      </ion-item>
      <ion-item>
        <ion-label>
          <Locale en="Training Mode:" zh_hk="訓練模式:" zh_cn="训练模式:" />
        </ion-label>
        <ion-select name="training_mode" value="continue">
          <ion-select-option value="continue">
            <Locale
              en="Continue from previous training"
              zh_hk="繼續上一次訓練"
              zh_cn="继续上一次训练"
            />
          </ion-select-option>
          <ion-select-option value="scratch">
            <Locale en="Train from scratch" zh_hk="從頭訓練" zh_cn="从头训练" />
          </ion-select-option>
        </ion-select>
      </ion-item>
      <br></br>
      {user ? (
        <ion-button type="submit">
          {<Locale en="Train AI" zh_hk="訓練 AI" zh_cn="训练 AI" />}
        </ion-button>
      ) : (
        <p>
          You can train ai after <Link href="/register">register</Link>.
        </p>
      )}
      <h2>
        <Locale
          en="Model Evaluation over Epoch"
          zh_hk="模型評估隨訓練輪數變化"
          zh_cn="模型评估随训练轮数变化"
        />
      </h2>
      <div id="demoMessage"></div>
      {ChartScript}
      <div style="width: 100%; max-height: 400px;">
        <p>
          <Locale en="Train Loss" zh_hk="訓練損失" zh_cn="训练损失" />
        </p>
        <Chart
          canvas_id="train_loss_canvas"
          data_labels={chart_label}
          datasets={getDatasets('train_loss')}
          borderWidth={1}
          min={0}
        />
      </div>
      <div style="width: 100%; max-height: 400px;">
        <p>
          <Locale en="Validation Loss" zh_hk="驗證損失" zh_cn="验证损失" />
        </p>
        <Chart
          canvas_id="val_loss_canvas"
          data_labels={chart_label}
          datasets={getDatasets('val_loss')}
          borderWidth={1}
          min={0}
        />
      </div>
      <div style="width: 100%; max-height: 400px;">
        <p>
          <Locale en="Train Accuracy" zh_hk="訓練準確率" zh_cn="训练准确率" />
        </p>
        <Chart
          canvas_id="train_accuracy_canvas"
          data_labels={chart_label}
          datasets={getDatasets('train_accuracy')}
          borderWidth={1}
          min={0}
          max={1}
        />
      </div>
      <div style="width: 100%; max-height: 400px;">
        <p>
          <Locale
            en="Validation Accuracy"
            zh_hk="驗證準確率"
            zh_cn="验证准确率"
          />
        </p>
        <Chart
          canvas_id="val_accuracy_canvas"
          data_labels={chart_label}
          datasets={getDatasets('val_accuracy')}
          borderWidth={1}
          min={0}
          max={1}
        />
      </div>
    </form>
  )
}

let submitTrainParser = object({
  learning_rate: float(),
  epoch_no: int(),
  training_mode: values(['continue' as const, 'scratch' as const]),
})

function SubmitTrain(attrs: {}, context: DynamicContext) {
  let user = getAuthUser(context)
  if (!user) throw 'You must be logged in to train AI'
  let body = getContextFormBody(context)
  let input = submitTrainParser.parse(body)
  if (input.training_mode === 'scratch') {
    del(proxy.training_stats, { id: notNull })
    let code = /* javascript for reset chart */ `
    train_loss_canvas.chart.data.labels = []
    val_loss_canvas.chart.data.labels = []
    train_accuracy_canvas.chart.data.labels = []
    val_accuracy_canvas.chart.data.labels = []
    for (let i = 0; i < ${MODEL_NO}; i++) {
      train_loss_canvas.chart.data.datasets[i].data = []
      val_loss_canvas.chart.data.datasets[i].data = []
      train_accuracy_canvas.chart.data.datasets[i].data = []
      val_accuracy_canvas.chart.data.datasets[i].data = []
    }
     train_loss_canvas.chart.update();
     val_loss_canvas.chart.update();
     train_accuracy_canvas.chart.update();
     val_accuracy_canvas.chart.update();               
    `
    broadcast(['eval', code])
  }

  //get the last epoch number from training_stats table
  let epoch = proxy.training_stats.length / MODEL_NO + 1
  async function train() {
    for (let i = 0; i < input.epoch_no; i++) {
      let data = []
      for (let label_id = 1; label_id <= MODEL_NO; label_id++) {
        await sleep(50)
        let train_loss = Math.random() * 10
        let val_loss = Math.random() * 10
        let train_accuracy = Math.random()
        let val_accuracy = Math.random()
        proxy.training_stats.push({
          user_id: user!.id!,
          learning_rate: input.learning_rate,
          epoch,
          train_loss,
          train_accuracy,
          val_loss,
          val_accuracy,
          label_id,
        })

        data.push({
          epoch: epoch,
          label: label_id,
          train_loss: train_loss,
          val_loss: val_loss,
          train_accuracy: train_accuracy,
          val_accuracy: val_accuracy,
        })
      }

      let code = /* javascript for update chart */ `
      const data = ${JSON.stringify(data)};
      const model_labels = ${JSON.stringify(model_labels())};
      train_loss_canvas.chart.data.labels.push('${epoch}');
      val_loss_canvas.chart.data.labels.push('${epoch}');
      train_accuracy_canvas.chart.data.labels.push('${epoch}');
      val_accuracy_canvas.chart.data.labels.push('${epoch}');

      // if training_stats is empty, set the chart data
      if (${proxy.training_stats.length === MODEL_NO}) { 
        train_loss_canvas.chart.data.labels = ['1']
        val_loss_canvas.chart.data.labels = ['1']
        train_accuracy_canvas.chart.data.labels = ['1']
        val_accuracy_canvas.chart.data.labels = ['1']
        for (let i = 0; i < ${MODEL_NO}; i++) {
          train_loss_canvas.chart.data.datasets[i] = {label: 'Model ' + model_labels[i] +' train_loss', data: []}
          val_loss_canvas.chart.data.datasets[i] = {label: 'Model ' + model_labels[i] +' val_loss', data: []}
          train_accuracy_canvas.chart.data.datasets[i] = {label: 'Model ' + model_labels[i] +' train_accuracy', data: []}
          val_accuracy_canvas.chart.data.datasets[i] = {label: 'Model ' + model_labels[i] +' val_accuracy', data: []}
        }
      }

      for (let i = 0; i < data.length; i++) {
        train_loss_canvas.chart.data.datasets[i].data.push(data[i].train_loss);
        val_loss_canvas.chart.data.datasets[i].data.push(data[i].val_loss);
        train_accuracy_canvas.chart.data.datasets[i].data.push(data[i].train_accuracy);
        val_accuracy_canvas.chart.data.datasets[i].data.push(data[i].val_accuracy);

        train_loss_canvas.chart.update();
        val_loss_canvas.chart.update();
        train_accuracy_canvas.chart.update();
        val_accuracy_canvas.chart.update();
      } 
      `
      broadcast(['eval', code])
      epoch++
    }
  }

  train()
  throw EarlyTerminate
}

function broadcast(message: ServerMessage) {
  sessions.forEach(session => {
    if (session.url?.startsWith('/train-ai')) {
      session.ws.send(message)
    }
  })
}

let routes = {
  '/train-ai': {
    title: <Title t={pageTitle} />,
    description: (
      <Locale
        en="View model training progress and submit training request"
        zh_hk="查看模型訓練進度及提交訓練請求"
        zh_cn="查看模型训练进度及提交训练请求"
      />
    ),
    node: page,
  },
  '/train-ai/train': {
    title: apiEndpointTitle,
    description:
      'Train the model with the given learning rate and epoch number',
    node: <SubmitTrain />,
    streaming: false,
  },
} satisfies Routes

export default { routes }
